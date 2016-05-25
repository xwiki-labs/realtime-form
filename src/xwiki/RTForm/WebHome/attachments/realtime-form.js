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
        version: '1.0',
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

    var canonicalize = function(text) { return text.replace(/\r\n/g, '\n'); };

    window.Toolbar = Toolbar;

    var module = window.REALTIME_MODULE = {
        TextPatcher: TextPatcher,
        Sortify: JSONSortify,
        Formula: Formula,
    };

    var getInputType = Formula.getInputType;

    var eventsByType = Formula.eventsByType;

    var Map = window.myMap = module.Map = {};

    var UI = module.UI = {
        ids: [],
        each: function (f) {
            UI.ids.forEach(function (id, i, list) {
                f(UI[id], i, list);
            });
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
        var $contentInner = $('#update'); // Object editor
        if (!$contentInner.length) {
            inline = true;
            $contentInner = $('#inline');
        }
        var formId = inline ? 'inline' : 'update';
        var $elements = module.elements = $contentInner.find('input, select, textarea');

        // Change the inner to set the position of the toolbar
        if (inline) { $contentInner = $('#inline .xform'); }

        $elements.each(function (index, element) {
            var $this = $(this);

            var id = $this.attr('id');
            if (!id) { return; }
            var type = getInputType($this);

            // ignore hidden inouts, submit inputs, and buttons
            if (['button', 'submit', 'hidden'].indexOf(type) !== -1) {
                return;
            };

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
                            canonicalize($this.val());
                    };
                }
            }());

            var update = component.update = function () { Map[id] = component.value(); };
            update();
        });

        // TOOLBAR style
        var TOOLBAR_CLS = Toolbar.TOOLBAR_CLS;
        var toolbar_style = [
            '<style>',
            '.' + TOOLBAR_CLS + ' {',
            '    width: 100%;',
            '    color: #666;',
            '    font-weight: bold;',
            '    background-color: #f0f0ee;',
            '    border: 0, none;',
            '    height: 24px;',
            '    float: left;',
            '}',
            '.' + TOOLBAR_CLS + ' div {',
            '    padding: 0 10px 0 5px;',
            '    height: 1.5em;',
            '    background: #f0f0ee;',
            '    line-height: 25px;',
            '    height: 24px;',
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

            var setEditable = module.setEditable = function (bool) {
                /* (dis)allow editing */
                $elements.each(function () {
                    $(this).attr('disabled', !bool);
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
                initialState: stringifyMap(Map) || '{}',

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
            }

            // Form read/update
            var readValues = function () {
                UI.each(function (ui, i, list) {
                    Map[ui.id] = ui.value();
                });
            };
            var updateValues = function () {
                var userDoc = module.realtime.getUserDoc();
                var parsed = JSON.parse(userDoc);

                var content = parsed.content || {};

                // Update our Map with the latest values of fields.
                // This allows communication between "inline" and "object" editor which don't have the same fields.
                Object.keys(content).forEach(function(key) {
                    if (UI.ids.indexOf(key) === -1) { Map[key] = content[key]; }
                });

                UI.each(function (ui, i, list) {
                    var newval = content[ui.id];
                    var oldval = ui.value();

                    if (typeof newval === "undefined") { return; } // The remote document doesn't know that field yet
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
                updateValues();
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
            };

            var onLocal = realtimeOptions.onLocal = function () {
                if (initializing) { return; }
                /* serialize local changes */
                readValues();

                var sjson = stringifyMap(Map);
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

                updateValues();

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
                ErrorBox.show('disconnected');
            };

            var rti = module.realtimeInput = realtimeInput.start(realtimeOptions);

            module.abortRealtime = function () {
                module.realtime.abort();
                module.leaveChannel();
                Saver.stop();
                onAbort();
            };

            UI.each(function (ui, i, list) {
                var type = ui.type;
                var events = eventsByType[type];
                ui.$.on(events, function() {
                    Saver.destroyDialog();
                    Saver.setLocalEditFlag(true);
                    onLocal();
                });
            });
        };

        whenReady();
    };

    return module;
});
