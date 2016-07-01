(function() {
var DEMO_MODE = "$!request.getParameter('demoMode')" || false;
DEMO_MODE = (DEMO_MODE === true || DEMO_MODE === "true") ? true : false;
// Not in edit mode?
if (!DEMO_MODE && window.XWiki.contextaction !== 'edit' && 1==2) { return false; }
var path = "$xwiki.getURL('RTFrontend.LoadEditors','jsx')" + '?minify=false&demoMode='+DEMO_MODE;
var pathErrorBox = "$xwiki.getURL('RTFrontend.ErrorBox','jsx')" + '?';
require([path, pathErrorBox, 'jquery'], function(Loader, ErrorBox, $) {
    if(!Loader) { return; }

    // Do not start RTForm is there is already an active RTForm/Rtwiki/Rtwysiwyg in that page
    // This is a fix to the object editor issue which duplicates the RTForm elements when an object is added
    if ($('.rt-toolbar').length) { return; }

    // VELOCITY
    #set ($document = $xwiki.getDocument('RTForm.WebHome'))
    var PATHS = {
        RTForm_WebHome_realtime_netflux: "$document.getAttachmentURL('realtime-form.js')",
        RTForm_WebHome_realtime_formula: "$document.getAttachmentURL('ula.js')",
    };
    // END_VELOCITY

    for (var path in PATHS) { PATHS[path] = PATHS[path].replace(/\.js$/, ''); }
    require.config({paths:PATHS});

    var launchRealtime = function (config, keys) {
        require(['RTForm_WebHome_realtime_netflux'], function (RTForm) {
            if (RTForm && RTForm.main) {
                RTForm.main(config, keys);
            } else {
                console.error("Couldn't find RTForm.main, aborting");
            }
        });
    };

    var getWysiwygLock = function () {
        var force = document.querySelectorAll('a[href*="editor=inline"][href*="sheet=CKEditor.EditSheet"][href*="/edit/"]');
        return force.length? force[0] : false;
    };
    var getFormLock = function () {
        var force = document.querySelectorAll('a[href*="editor=inline"][href*="/edit/"], a[href*="editor=object"][href*="/edit/"]');
        return force.length? force[0] : false;
    };

    var lock = Loader.getDocLock();
    var formLock = !getWysiwygLock() && getFormLock();

    var editor = 'object';
    var href = document.location.href;
    var params = href.substr(href.indexOf('?')+1);
    var ckEditor = false;
    params.split('&').forEach(function(elmt) {
        if (elmt === 'editor=inline') { editor = 'inline'; return false; }
        if (elmt === 'sheet=CKEditor.EditSheet') { ckEditor = true; return false; }
    });
    if (window.XWiki.editor === 'inline') { editor = 'inline'; }

    var isRTForm = function() {
        if (ckEditor) { return false; }
        if (!(window.XWiki.editor === 'inline' || window.XWiki.editor === 'object')) { return false; }
        // Disallow RTForm in AWM wizard (editor inline)
        var wizardHeader = document.getElementsByClassName('wizard-header');
        return (wizardHeader.length === 0);
    };

    // Check if RTForm is allowed globally in the admin UI or only allowed for specific classes.
    // It is also possible that a sheet requests that RTForm is enabled for the related class.
    var isRtFormAllowed = function() {
        var allowedGlobally = ("$!document.getObject("RTForm.ConfigurationClass").getProperty("enableGlobally").value" === "1");
        var allowedBySheet = ("$!request.getParameter('enableRtForm')" === "1");
        if (allowedGlobally || allowedBySheet) { return true; }

        var allowedClasses = [];
        #set ($enabledClasses = $document.getObject("RTForm.ConfigurationClass").getProperty("enabledClasses").value)
        #foreach ($className in $enabledClasses) allowedClasses.push('$escapetool.javascript($className)'); #end

        var objectsInThePage = JSON.parse($('#realtime-form-getobjects').html());
        var allowed = false;
        objectsInThePage.forEach(function (obj) {
            if (allowedClasses.indexOf(obj) !== -1) {
                allowed = true;
                return;
            }
        });
        return allowed;
    };

    var info = {
        type: 'rtform',
        href: '&editor='+editor+'&force=1',
        name: "Form"
    };

    var getKeyData = function(config) {
        return [
            {doc: config.reference, mod: config.language+'/events', editor: "1.0"},
            {doc: config.reference, mod: config.language+'/content',editor: "rtform"}
        ];
    };

    var parseKeyData = function(config, keysResultDoc) {
        var keys = {};
        var keysResult = keysResultDoc[config.reference];
        if (!keysResult) { console.error("Unexpected error with the document keys"); return keys; }

        var keysResultContent = keysResult[config.language+'/content'];
        if (!keysResultContent) { console.error("Missing content keys in the document keys"); return keys; }

        var keysResultEvents = keysResult[config.language+'/events'];
        if (!keysResultEvents) { console.error("Missing event keys in the document keys"); return keys; }

        if (keysResultContent.rtform && keysResultEvents["1.0"]) {
            keys.rtform = keysResultContent.rtform.key;
            keys.rtform_users = keysResultContent.rtform.users;
            keys.events = keysResultEvents["1.0"].key;
        }
        else { console.error("Missing mandatory RTForm key in the document keys"); return keys; }

        var activeKeys = keys.active = {};
        for (var key in keysResultContent) {
            if (key !== "rtform" && keysResultContent[key].users > 0) {
                activeKeys[key] = keysResultContent[key];
            }
        }
        return keys;
    };

    var displayTranslatedPageModal = function() {
        var behave = {
            onYes: function () {
                var href = window.location.href;
                href = href.replace(/\?(.*)$/, function (all, args) {
                    return '?' + args.split('&').filter(function (arg) {
                        var type = arg.split('=')[0];
                        if (type === 'language') { return false; }
                        else { return true; }
                    }).join('&');
                });

                if(href.indexOf('?') === -1) { href += '?'; }
                href += "&language=default";

                window.location.href = href;
             },
            onNo: function () {}
        };

        var param = {
            confirmationText: "You are editing a form from a translated page. If you want to use a realtime session of that form, you have to edit using the default language. Do you want to switch to realtime?",
            yesButtonText: "Go to the realtime session",
            noButtonText: "Continue to edit the translated page offline",
            showCancelButton: false
        };

        new XWiki.widgets.ConfirmationBox(behave, param);
    };

    if (lock) {
        // found a lock link : check active sessions
        Loader.checkSessions(info);
    } else if ((isRTForm() && isRtFormAllowed()) || DEMO_MODE) {
        var config = Loader.getConfig();
        if(config.language !== "default" && !DEMO_MODE) {
            console.log("Realtime Form is only available for the default language of the document!");
            displayTranslatedPageModal();
            return;
        }
        var keysData = getKeyData(config);
        // No lock and we are using wiki editor : start realtime
        Loader.getKeys(keysData, function(keysResultDoc) {
            var keys = parseKeyData(config, keysResultDoc);
            if(!keys.rtform || !keys.events) {
                ErrorBox.show('unavailable');
                console.error("You are not allowed to create a new realtime session for that document.");
            }
            if (Object.keys(keys.active).length > 0) {
                if (keys.rtform_users > 0 || Loader.isForced) {
                    launchRealtime(config, keys);
                } else {
                    var callback = function() {
                        launchRealtime(config, keys);
                    };
                    console.log("Join the existing realtime session or create a new one");
                    Loader.displayModal("rtform", Object.keys(keys.active), callback, info);
                }
            } else {
                launchRealtime(config, keys);
            }
        });
    }


    var displayButtonModal = function() {
        if ($('.realtime-button-rtform').length) {
            var button = new Element('button', {'class': 'btn btn-success'});
            var button2 = new Element('button', {'class': 'btn btn-success'});
            var br =  new Element('br');
            button.insert(Loader.messages.redirectDialog_join.replace(/\{0\}/g, "Form (object)"));
            button2.insert(Loader.messages.redirectDialog_join.replace(/\{0\}/g, "Form (inline)"));
            $('.realtime-button-rtform').prepend(button);
            $('.realtime-button-rtform').prepend(br);
            $('.realtime-button-rtform').prepend(button2);
            $('.realtime-button-rtform').prepend(br);
            $(button).on('click', function() {
                info.href = '&editor=object&force=1';
                window.location.href = Loader.getEditorURL(window.location.href, info);
            });
            $(button2).on('click', function() {
                info.href = '&editor=inline&force=1';
                window.location.href = Loader.getEditorURL(window.location.href, info);
            });

        } else if(lock && formLock) {
            var button = new Element('button', {'class': 'btn btn-primary'});
            var button2 = new Element('button', {'class': 'btn btn-primary'});

            var br =  new Element('br');
            button.insert(Loader.messages.redirectDialog_create.replace(/\{0\}/g, "Form (object)"));
            button2.insert(Loader.messages.redirectDialog_create.replace(/\{0\}/g, "Form (inline)"));

            $('.realtime-buttons').append(br);
            $('.realtime-buttons').append(button2);
            $('.realtime-buttons').append(br);
            $('.realtime-buttons').append(button);

            $(button).on('click', function() {
                info.href = '&force=1&editor=object';
                window.location.href = Loader.getEditorURL(window.location.href, info);
            });
            $(button).on('click', function() {
                info.href = '&force=1&editor=inline';
                window.location.href = Loader.getEditorURL(window.location.href, info);
            });

        }
    };
    displayButtonModal();
    $(document).on('insertButton', displayButtonModal);
});
})();
