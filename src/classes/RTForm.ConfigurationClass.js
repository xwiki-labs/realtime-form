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
    "displayType": "",
    "prettyName": "Enable RTForm for all classes of the wiki (If not changed, configuration from the main wiki will be used)",
    "validationMessage": "",
    "validationRegExp": ""
  }));
  xcl.addProp("enabledClasses", props.DBList.create({
    "classname": "",
    "customDisplay": "{{velocity}}\n#set ($propertyClass = $object.getxWikiClass().get($name))\n#if ($type == 'edit')\n  {{html clean=false}}\n    $doc.displayEdit($propertyClass, $prefix, $object)\n    <br>\n    Not in the list ? <input type=\"text\" id=\"rtformEnableOtherClass\" name=\"rtformEnableOtherClass\" style=\"display: inline; min-width: 250px; width: 50%;\"/> <input type=\"button\" id=\"rtformAddClass\" value=\"Add\" class=\"btn btn-success\" style=\"display: inline; width: 50px;\"/>\n    <script type=\"text/javascript\">\n    require(['jquery'], function($) {\n      $('#rtformAddClass').on('click', function() {\n        var value = $('#rtformEnableOtherClass').val();\n        var elmt = $('#RTForm\\\\.WebHome_RTForm\\\\.ConfigurationClass_1_enabledClasses');\n        var opt = ('<option selected=\"selected\">' + value + '</option>');\n        $(opt).val(value);\n        $(opt).attr(\"label\", value);\n        $(elmt).append(opt);\n      });\n    });\n    </script>\n  {{/html}}\n#else\n  $value\n#end\n{{/velocity}}",
    "idField": "",
    "multiSelect": "1",
    "picker": "0",
    "prettyName": "List of classes allowed to use Realtime Form",
    "relationalStorage": "1",
    "separator": ",",
    "separators": ",",
    "size": "10",
    "sort": "none",
    "sql": ", BaseObject obj where obj.name=doc.fullName and obj.className = 'XWiki.ClassSheetBinding' and doc.xWikiClassXML <> '' order by doc.fullName",
    "validationMessage": "",
    "validationRegExp": "",
    "valueField": ""
  }));
});
