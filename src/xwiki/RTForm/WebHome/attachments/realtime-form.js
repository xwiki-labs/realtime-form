define([
    'RTFrontend_errorbox',
    'RTFrontend_toolbar',
    'RTFrontend_realtime_input',
    'RTFrontend_json_ot',
    'json.sortify',
    'RTFrontend_text_patcher',
    'RTFrontend_interface',
    'RTFrontend_saver',
    'RTFrontend_chainpad',
    'RTForm_WebHome_realtime_formula',
    'RTFrontend_diffDOM',
    'jquery'
], function (ErrorBox, Toolbar, realtimeInput, JsonOT, JSONSortify, TextPatcher, Interface, Saver, Chainpad, Formula) {
    var $ = window.jQuery;
    var DiffDom = window.diffDOM;

    /* REALTIME_DEBUG exposes a 'version' attribute.
        this must be updated with every release */
    var REALTIME_DEBUG = window.REALTIME_DEBUG = {
        version: '1.2.1',
        local: {},
        remote: {}
    };

    // Create a fake "Crypto" object which will be passed to realtime-input
    var Crypto = {
        encrypt : function(msg, key) { return msg; },
        decrypt : function(msg, key) { return msg; },
        parseKey : function(key) { return {cryptKey : ''}; }
    }

    var stringify = function (obj) {
        return JSONSortify(obj);
    };

    var canonicalize = function(text) { if(typeof text !== "string") {return;} return text.replace(/\r\n/g, '\n'); };

    window.Toolbar = Toolbar;

    var module = window.REALTIME_MODULE = {
        TextPatcher: TextPatcher,
        Sortify: JSONSortify,
        Formula: Formula,
    };

    var getInputType = Formula.getInputType;

    var eventsByType = Formula.eventsByType;

    var Map = window.myMap = module.Map = {};

    var UI = window.UI = module.UI = {
        ids: [],
        each: function (f) {
            UI.ids.forEach(function (id, i, list) {
                f(UI[id], i, list);
            });
        },
        add: function (id, ui) {
            if (UI.ids.indexOf(id) === -1) {
                UI.ids.push(id);

                UI[id] = ui;
                return true;
            } else {
                // it already exists

                return false;
            }
        },
        remove: function (id) {
            if (UI[id]) {
                delete UI[id];
            }
            var idx = UI.ids.indexOf(id);
            if (idx > -1) {
                UI.ids.splice(idx, 1);
                return true;
            }
        }
    };

    var uid = Formula.uid;

    var cursorTypes = ['textarea', 'password', 'text'];

    var main = module.main = function (editorConfig, docKeys) {

        var WebsocketURL = editorConfig.WebsocketURL;
        var userName = editorConfig.userName;
        var DEMO_MODE = editorConfig.DEMO_MODE;
        var language = editorConfig.language;
        var saverConfig = editorConfig.saverConfig || {};
        saverConfig.chainpad = Chainpad;
        saverConfig.editorType = 'rtform';
        saverConfig.editorName = 'Form';
        saverConfig.isHTML = false;
        saverConfig.mergeContent = false;
        var Messages = saverConfig.messages || {};

        /** Key in the localStore which indicates realtime activity should be disallowed. */
        var LOCALSTORAGE_DISALLOW = editorConfig.LOCALSTORAGE_DISALLOW;

        var channel = docKeys.rtform;
        var eventsChannel = docKeys.events;

        var inline = false;
        // Set the inner to get the realtimed fields
        var $contentInner = $('#xwikiobjects'); // Object editor
        if (!$contentInner.length) {
            inline = true;
            $contentInner = $('#inline');
        }
        var formId = inline ? 'inline' : 'update';
        var $elements = module.elements = $contentInner.find('input, select, textarea').filter(function (index) {
            return $(this).attr('name') !== "form_token";
        });

        // Change the inner to set the position of the toolbar
        if (inline) { $contentInner = $('#inline .xform'); }

        var addElement = function (index, element) {
            var $this = $(element);

            var id = $this.attr('id');
            var name = $this.attr('name');
            if (!id) {
                var index = 0;
                while (document.getElementById(name+'-'+index) && index < 1000) { index++; }
                id = name+'-'+index;
                $this.attr('id', id);
            }
            if (!name) { return; }
            var type = getInputType($this);

            // ignore hidden inouts, submit inputs, and buttons
            if (['button', 'submit'].indexOf(type) !== -1) {
                return;
            };

            // Exclude the WYSIWYG editor
            if (type === "textarea" && $(this).css('visibility') === "hidden") { return; }

            $this   // give each element a uid
                .data('rtform-uid', id)
                    // get its type
                .data('rt-ui-type', type);

            UI.ids.push(id);

            var component = UI[id] = {
                id: id,
                $: $this,
                element: element,
                type: type,
                preserveCursor: cursorTypes.indexOf(type) !== -1,
                name: $this.prop('name'),
            };

            component.value = (function () {
                var checker = ['radio', 'checkbox'].indexOf(type) !== -1;

                if (checker) {
                    return function (content) {
                        return typeof content !== 'undefined'?
                            $this.prop('checked', !!content):
                            $this.prop('checked');
                    };
                } else {
                    return function (content) {
                        return typeof content !== 'undefined' ?
                            $this.val(content):
                            typeof $this.val() === "string" ? canonicalize($this.val()) : $this.val();
                    };
                }
            }());

            var update = component.update = function () { Map[id] = component.value(); };
            update();
        };
        $elements.each(addElement);

        // Stop RTForm if there is no RT element
        if (!UI.ids.length) { return; }


        // If the contentInner is not defined ($('.xform') does not exist?), replace it by the common parent of
        // the realtimes elements
        var allElements = [];
        UI.each(function (el) {
            if (el.$.is(':hidden')) { return; }
            allElements.push(el.element);
        });
        var commonContainer = function (elements) {
            var el = elements[0].parentElement;
            var res = false;
            while (!res && el && el.contains) {
                res = !elements.some(function(e) {
                    return !el.contains(e);
                });
                if (!res) { el = el.parentElement; }
            }
            return el;
        };
        if (!$contentInner.length) {
            $contentInner = $(commonContainer(allElements));
            if (!$contentInner.length) { $contentInner = $('#mainContentArea'); }
            if (!$contentInner.length) { return;} // No content inner to display the toolbar: abort
        }

        // Check if a value is in the Map associated with the given property
        // 1/ Filter the Map to get only the values of our property. We want only the keys of the Map which are "{propertyName}-{Integer}".
        // 2/ Use Array.some to check if the value of our $input is in the filtered Map
        var isValueInMap = function(value, name, callback) {
            var patt = /\-\d+$/;
            return Object.keys(Map).filter(m => {
                if (!patt.test(m)) { return false; }
                else { return m.replace(patt, '') === name; }
            }).some(function (key) {
                if (value === Map[key]) {
                    callback(key);
                    return true;
                }
            });
        }

        // Register the auto-suggest elements added to the page
        $(document).on('DOMNodeInserted' , function(e) {
            var $target = $(e.target);
            if ($target.is('li') && $target.find('input[type="hidden"]').length) {
                var $input = $target.find('input[type="hidden"]');
                var name = $input.attr('name');

                // We want to check if the auto-suggest value is already in the Map.
                // If it is in the Map, it means that it has been added by someone else and we have to 
		// use the same ID. If it is not in the Map, we have to generate an ID.
                var existingKey;
                var isInMap = isValueInMap($input.val(), name, key => {existingKey = key;});
                if (isInMap) { // The value is in the Map, with the id "existingKey"
                    $input.attr('id', existingKey);
                }
                else { // Not in the Map, generate an ID
                    var index = $('[name="'+name+'"]').length-1;
                    var existingIds = Object.keys(Map);
                    while (existingIds.indexOf(name+'-'+index) !== -1 && index < 1000) { index++; }
                    var id = name+'-'+index;
                    $input.attr('id', id);
                }

                //if (UI[id]) { $target.remove(); return; } WTF??

                // Add the element in the UI object
                addElement(null, $input);

                if(!isInMap) { // Add it to the Map!
                    module.changeEventListener && UI[id] && module.changeEventListener(UI[id]);
                    Saver.setLocalEditFlag(true);
                    module.onLocal();
                }
            }
        });
        $(document).on('DOMNodeRemoved' , function(e) {
            var $target = $(e.target);
            var $elements = $target.find('input, textarea, select');
            var removed = false;
            $elements.each(function (index, element) {
                var id = $(element).attr('id');
                if (UI[id]) {

                    delete UI[id];
                    delete Map[id];
                    var idx = UI.ids.indexOf(id);
                    if (idx > -1) {
                        UI.ids.splice(idx, 1);
                    }
                    removed = true;
                }
            });
            if (removed) { Saver.setLocalEditFlag(true); module.onLocal(); }
        });

        // TOOLBAR style
        var TOOLBAR_CLS = Toolbar.TOOLBAR_CLS;
        var toolbar_style = [
            '<style>',
            '.' + TOOLBAR_CLS + ' {',
            '    width: 100%;',
            '    color: #666;',
            '    /*font-weight: bold;*/',
            '    /*background-color: #f0f0ee;*/',
            '    border: 0, none;',
            '    /*height: 24px;*/',
            '    /*float: left;*/',
            '    position: relative;',
            '}',
            '.' + TOOLBAR_CLS + ' div {',
            '    padding: 0 10px 0 5px;',
            '    /*height: 1.5em;*/',
            '    /*background: #f0f0ee;*/',
            '    /*line-height: 25px;*/',
            '    /*height: 24px;*/',
            '    display: inline-block;',
            '    float: none',
            '}',
            '.rt-toolbar-rightside {',
            '    position: absolute;',
            '    right: 0px;',
            '}',
            '</style>'
        ];
        // END TOOLBAR style

        // DISALLOW REALTIME
        var allowRealtimeCbId = uid();
        Interface.setLocalStorageDisallow(LOCALSTORAGE_DISALLOW);
        var checked = (Interface.realtimeAllowed()? 'checked="checked"' : '');

        Interface.createAllowRealtimeCheckbox(allowRealtimeCbId, checked, Messages.allowRealtime);
        // hide the toggle for autosaving while in realtime because it
        // conflicts with our own autosaving system
        Interface.setAutosaveHiddenState(true);

        var $disallowButton = $('#' + allowRealtimeCbId);
        var disallowClick = function () {
            var checked = $disallowButton[0].checked;
            //console.log("Value of 'allow realtime collaboration' is %s", checked);
            if (checked || DEMO_MODE) {
                Interface.realtimeAllowed(true);
                // TODO : join the RT session without reloading the page?
                window.location.reload();
            } else {
                Interface.realtimeAllowed(false);
                module.abortRealtime();
            }
        };
        $disallowButton.on('change', disallowClick);

        if (!Interface.realtimeAllowed()) {
            console.log("Realtime is disallowed. Quitting");
            return;
        }
        // END DISALLOW REALTIME

        // configure Saver with the merge URL and language settings
        Saver.configure(saverConfig);

        console.log("Creating realtime toggle");

        var whenReady = function () {

            UI.each(function (el) {
                el.$.addClass('realtime-form-field');
            });

            var setEditable = module.setEditable = function (bool) {
                /* (dis)allow editing */
                UI.each(function (el) {
                    el.$.attr('disabled', !bool);
                });
            };
            setEditable(false);

            var initializing = true;
            var userList = {}; // List of pretty name of all users (mapped with their server ID)
            var toolbarList; // List of users still connected to the channel (server IDs)
            var addToUserList = function(data) {
                for (var attrname in data) { userList[attrname] = data[attrname]; }
                if(toolbarList && typeof toolbarList.onChange === "function") {
                    toolbarList.onChange(userList);
                }
            };

            var myData = {};
            var myUserName = ''; // My "pretty name"
            var myID; // My server ID

            var setMyID = function(info) {
              myID = info.myID || null;
              myUserName = myID;
              myData[myID] = {
                name: userName
              };
              addToUserList(myData);
            };

            var stringifyMap = function(map) {
              return stringify({
                content: map,
                metadata: userList
              });
            }

            var realtimeOptions = {
                // provide initialstate...
                initialState: '{}',

                // the websocket URL
                websocketURL: WebsocketURL,

                // our username
                userName: userName,

                // the channel we will communicate over
                channel: channel,

                // method which allows us to get the id of the user
                setMyID: setMyID,

                // Crypto object to avoid loading it twice in Cryptpad
                crypto: Crypto,

                // really basic operational transform
                transformFunction : JsonOT.validate
            };
            var updateUserList = function(shjson) {
                // Extract the user list (metadata) from the hyperjson
                var hjson = (shjson === "") ? {} : JSON.parse(shjson);
                if(hjson && hjson.metadata) {
                  var userData = hjson.metadata;
                  // Update the local user data
                  addToUserList(userData);
                }
                return hjson;
            };

            // Form read/update
            var readValues = window.readValues = function () {
                UI.each(function (ui, i, list) {
                    Map[ui.id] = ui.value();
                });
            };
            var preventLocal = false;
            var updateValues = function (firstLoad) {
                var userDoc = module.realtime.getUserDoc();
                var parsed = JSON.parse(userDoc);

                var content = parsed.content || {};
                preventLocal = true;

                // Remove all the autosuggest values and replace them with the remote ones if they exist if the remote document
                if (Object.keys(content).length > 0) {
                    var idsUI = UI.ids.slice(0);
                    idsUI.forEach(function (id) {
                        var patt = /\-\d+$/;
                        var ui = UI[id];
                        if (!ui) { return; }
                        var name = ui.name;
                        var isSuggest = patt.test(id) && id.replace(patt, '') === name
                                        && ui.$.is('input[type="hidden"]')
                                        && ui.$.parents('li').length;
                        if (isSuggest && typeof content[name] !== "undefined") {
                            if (content[id] && content[id] === ui.value()) { return; }
                            ui.$.parents('li').remove();
                            delete Map[id];
                            UI.remove(id);
                        }
                    });
                }

                UI.each(function (ui, i, list) {
                    var newval = content[ui.id];
                    var oldval = ui.value();

                    // The remote document doesn't know that field yet OR the field is a removed autosuggest value
                    if (typeof newval === "undefined" && Object.keys(content).length > 0) {
                        var isAutoSuggest = ui.id.lastIndexOf('-') !== -1
                                        && ui.id.substr(0,ui.id.lastIndexOf('-')+1) === ui.name+'-'
                                        && ui.$.is('input[type="hidden"]');
                        if (isAutoSuggest) { // Remove it
                            ui.$.parents('li').remove();
                        }
                        return;
                    }
                    if (typeof newval === "undefined") {
                        return;
                    }
                    if (newval === oldval) { return; }

                    var op;
                    var element = ui.element;
                    if (ui.preserveCursor) {
                        op = TextPatcher.diff(oldval, newval);
                        var selects = ['selectionStart', 'selectionEnd'].map(function (attr) {
                            var before = element[attr];
                            var after = TextPatcher.transformCursor(element[attr], op);
                            return after;
                        });
                    }

                    ui.value(newval);
                    ui.update();

                    if (op) {
                        element.selectionStart = selects[0];
                        element.selectionEnd = selects[1];
                    }
                });

                // Replace the suggest values with the remote ones if they exist if the remote document
                if (Object.keys(content).length > 0) {
                    Object.keys(content).forEach(function(key) {
                        Map[key] = content[key];
                        var patt = /\-\d+$/;
                        if (!patt.test(key)) { return; }
                        var name = key.replace(patt, '');
                        if (UI.ids.indexOf(name) === -1) { return; }
                        if (UI[key] && UI[key].value() === content[key]) { return;}
                        var instance = XWiki.widgets.UserPicker.instances[name];
                        if (!instance) { return; }
                        $('input[type!="hidden"][name="'+name+'"]').val(content[key]);
                        instance._selectionManager.initializeSelection();
                    });
                }
                preventLocal = false;
            };

            var createSaver = function (info) {
                if(!DEMO_MODE) {
                    // this function displays a message notifying users that there was a merge
                    Saver.lastSaved.mergeMessage = Interface.createMergeMessageElement(toolbar.toolbar
                        .find('.rt-toolbar-rightside'),
                        saverConfig.messages);
                    Saver.setLastSavedContent(JSON.stringify(Map));
                    var saverCreateConfig = {
                      formId: formId, // Id of the wiki page form
                      // setTextValue is nerver used when the merge is disabled
                      setTextValue: function() {},
                      getSaveValue: function() {
                          return $('#'+formId).serialize();
                      },
                      getTextValue: function() {
                          return JSON.stringify(Map);
                      },
                      realtime: info.realtime,
                      userList: info.userList,
                      userName: userName,
                      network: info.network,
                      channel: eventsChannel,
                      demoMode: DEMO_MODE
                    }
                    Saver.create(saverCreateConfig);
                }
            };

            var onRemote = realtimeOptions.onRemote = function (info) {
                if (initializing) { return; }

                var sjson = info.realtime.getUserDoc();
                updateUserList(sjson);

                /* integrate remote changes */
                if (stringifyMap(Map) !== module.realtime.getUserDoc()) {
                    updateValues();
                }
            };

            var onInit = realtimeOptions.onInit = function (info) {
                var realtime = module.realtime = info.realtime;
                // Create the toolbar
                var $bar = $contentInner;
                toolbarList = info.userList;
                var config = {
                    userData: userList
                    // changeNameID: 'cryptpad-changeName'
                };
                toolbar = Toolbar.create($bar, info.myID, info.realtime, info.getLag, info.userList, config, toolbar_style);
                $(toolbar.toolbar).addClass('breadcrumb');
            };

            var onLocal = realtimeOptions.onLocal = module.onLocal = function () {
                if (initializing) { return; }
                /* serialize local changes */
                readValues();
                var sjson = stringifyMap(Map);
                if (sjson === module.realtime.getUserDoc()) { return; }
                module.patchText(sjson);

                if (module.realtime.getUserDoc() !== sjson) {
                    console.error("realtime.getUserDoc() !== sjson");
                    module.patchText(sjson, true);
                }
            };

            var onReady = realtimeOptions.onReady = function (info) {
                module.leaveChannel = info.leave;
                module.patchText = TextPatcher.create({
                    realtime: info.realtime,
                    logging: false,
                });

                var userDoc = module.realtime.getUserDoc();
                updateUserList(userDoc);

                updateValues(true);

                console.log("Unlocking editor");
                setEditable(true);
                initializing = false;

                onLocal();
                createSaver(info);
            };

            var onAbort = realtimeOptions.onAbort = function (info) {
                console.log("Aborting the session!");
                // TODO inform them that the session was torn down
                toolbar.failed();
                toolbar.toolbar.remove();
                if (Interface.realtimeAllowed()) {
                    ErrorBox.show('disconnected');
                }
            };

            var rti = module.realtimeInput = realtimeInput.start(realtimeOptions);

            module.abortRealtime = function () {
                module.realtime.abort();
                module.leaveChannel();
                $elements.removeClass('realtime-form-field');
                Saver.stop();
                onAbort();
            };

            var changeEventListener = module.changeEventListener = function (ui, i, list) {
                var type = ui.type;
                var events = eventsByType[type];
                ui.$.on(events, function() {
                    Saver.destroyDialog();
                    Saver.setLocalEditFlag(true);
                    if (!preventLocal) {
                        onLocal();
                    }
                });
            };
            UI.each(changeEventListener);
        };

        whenReady();
    };

    return module;
});
