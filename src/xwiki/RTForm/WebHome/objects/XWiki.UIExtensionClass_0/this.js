XWikiObj(function (obj) {
    obj.setContent("{{velocity}}\r\n{{html clean=false}}\r\n#set ($data = \"[\")\r\n#foreach ($obj in $doc.getxWikiObjects().keySet())\r\n#if ($velocityCount != 1)\r\n#set ($data = \"$data, \")\r\n#end\r\n#set ($q = $escapetool.q)\r\n#set ($data = \"$data$q$obj$q\")\r\n#end\r\n#set ($data = \"$data]\")\r\n#set ($json = {\"objects\" : $data})\r\n<div style=\"display:none\" id=\"realtime-form-getobjects\">$data</div>\r\n{{/html}}\r\n{{/velocity}}");
    obj.setExtensionPointId("org.xwiki.platform.template.header.after");
    obj.setName("header.rtform.getObjects");
    obj.setParameters("");
    obj.setScope("wiki");
});
