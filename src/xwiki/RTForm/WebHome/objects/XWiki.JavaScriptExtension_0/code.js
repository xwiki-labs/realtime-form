var DEMO_MODE = "$!request.getParameter('demoMode')" || false;
DEMO_MODE = (DEMO_MODE === true || DEMO_MODE === "true") ? true : false;
var path = "$xwiki.getURL('RTFrontend.LoadEditors','jsx')" + '?minify=false&demoMode='+DEMO_MODE;
var pathErrorBox = "$xwiki.getURL('RTFrontend.ErrorBox','jsx')" + '?';
require([path, pathErrorBox], function(Loader, ErrorBox) {
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

    var getDocLock = function () {
        var force = document.querySelectorAll('a[href*="force=1"][href*="/edit/"]');
        return force.length? force[0] : false;
    };
    var lock = getDocLock();

    var editor = 'object';
    var href = document.location.href;
    var params = href.substr(href.indexOf('?')+1);
    var ckEditor = false;
    params.split('&').forEach(function(elmt) {
        if (elmt === 'editor=inline') { editor = 'inline'; return false; }
        if (elmt === 'sheet=CKEditor.EditSheet') { ckEditor = true; return false; }
    });

    var isRTForm = function() {
        if (ckEditor) { return false; }
        if (!(window.XWiki.editor === 'inline' || window.XWiki.editor === 'object')) { return false; }
        // Disallow RTForm in AWM wizard (editor inline)
        var wizardHeader = document.getElementsByClassName('wizard-header');
        return (wizardHeader.length === 0);
    }

    var info = {
        type: 'rtform',
        href: '&editor='+editor+'&force=1',
        name: "Wiki"
    };

    if (lock) {
        // found a lock link : check active sessions
        Loader.checkSessions(info);
    } else if (isRTForm() || DEMO_MODE) {
        var config = Loader.getConfig();
        var keysData = [
            {doc: config.reference, mod: config.language+'/events', editor: "1.0"},
            {doc: config.reference, mod: config.language+'/content', editor: "rtform"}
        ];
        // No lock and we are using wiki editor : start realtime
        Loader.getKeys(keysData, function(keysResultDoc) {
            var keys = {};
            var keysResult = keysResultDoc[config.reference];
            if(keysResult[config.language+'/events'] && keysResult[config.language+'/events']["1.0"] &&
               keysResult[config.language+'/content'] && keysResult[config.language+'/content']["rtform"]) {
                keys.rtform = keysResult[config.language+'/content']["rtform"].key;
                keys.events = keysResult[config.language+'/events']["1.0"].key;
            }
            if(keys.rtform && keys.events) {
                launchRealtime(config, keys);
            }
            else {
                var type = (Object.keys(keys).length === 1) ? Object.keys(keys)[0] : null;
                if(type) {
                    Loader.displayModal(type, info);
                    console.error("You are not allowed to create a new realtime session for that document. Active session : "+Object.keys(keys));
                    console.log("Join that realtime editor if you want to edit this document");
                }
                else {
                    ErrorBox.show('unavailable');
                    console.error("You are not allowed to create a new realtime session for that document.");
                }
            }
        });
    }
});
