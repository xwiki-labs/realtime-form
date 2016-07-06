#set ($rtformRef = $services.model.resolveDocument("RTForm.WebHome"))
var rtformPath = "$xwiki.getURL($rtformRef, 'jsx', 'enableRtForm=1')";
require([rtformPath]);
