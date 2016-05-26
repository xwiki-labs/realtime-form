define([], function () {
    var ula = {};

    var uid = ula.uid = (function () {
        var i = 0;
        var prefix = 'rt_';
        return function () { return prefix + i++; };
    }());

    ula.getInputType = function ($el) { return $el[0].type; };

    ula.eventsByType = {
        text: 'change keyup',
        hidden: 'change',
        password: 'change keyup',
        radio: 'change click',
        checkbox: 'change click',
        number: 'change',
        range: 'keyup change',
        'select-one': 'change',
        'select-multiple': 'change',
        textarea: 'change keyup',
    };

    return ula;
});
