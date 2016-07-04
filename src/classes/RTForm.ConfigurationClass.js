XClass(function (xcl, XWiki) {
  var props = XWiki.model.properties;
  xcl.setCustomClass("");
  xcl.setCustomMapping("");
  xcl.setDefaultViewSheet("");
  xcl.setDefaultEditSheet("");
  xcl.setDefaultWeb("");
  xcl.setNameField("");
  xcl.setValidationScript("");
  xcl.addProp("enableGlobally", props.XBoolean.create({
    "customDisplay": "",
    "defaultValue": "",
    "displayFormType": "select",
    "displayType": "",
    "prettyName": "Enable RTForm for all classes of the wiki (If not changed, configuration from the main wiki will be used)",
    "validationMessage": "",
    "validationRegExp": ""
  }));
  xcl.addProp("enabledClasses", props.DBList.create({
    "classname": "",
    "customDisplay": "",
    "idField": "",
    "multiSelect": "1",
    "picker": "0",
    "prettyName": "List of classes allowed to use Realtime Form",
    "relationalStorage": "1",
    "separator": ",",
    "separators": ",",
    "size": "10",
    "sort": "none",
    "sql": ", BaseObject obj where obj.name=doc.fullName and obj.className = 'XWiki.ClassSheetBinding' and doc.xWikiClassXML <> ''",
    "validationMessage": "",
    "validationRegExp": "",
    "valueField": ""
  }));
});
