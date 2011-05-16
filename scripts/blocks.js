
function showColorPicker(){
    var self = $(this);
    cw.input(this);
    cw.onchange(function(){
        var color = self.val();
        self.css({color: color, 'background-color': color});
    });
    $('#color_popup').bPopup({modalColor: 'transparent'});
}
$('.workspace:visible .scripts_workspace').delegate('input[type=color]', 'click', showColorPicker);
$(document).ready(function(){
    window.cw = Raphael.colorwheel($('#color_contents')[0], 300, 180);
});


$.selected_block = function(){
    return $('.scripts_workspace .selected');
};

$.extend($.fn,{
  long_name: function() {
    var names;
    names = [];
    this.each(function(idx,e) {
      var parts = [e.tagName.toLowerCase()];
      e.id ? parts.push('#' + e.id) : null;
      e.className ? parts.push('.' + e.className.split(/\s/).join('.')) : null;
      return names.push(parts.join(''));
    });
    return '[' + names.join(', ') + ']';
  },
  info: function(){
      return this.closest('.wrapper').long_name();
  },
  block_type: function(){
      // FIXME: Move all type-specific functionality to 
      if (this.is('.trigger')) return 'trigger';
      if (this.is('.step')) return 'step';
      if (this.is('.number')) return 'number';
      if (this.is('.boolean')) return 'boolean';
      if (this.is('.string')) return 'string';
      return 'unknown';
  },
  extract_script: function(){
      if (this.length === 0) return '';
      if (this.is(':input')) return this.val();
      if (this.is('.empty')) return '// do nothing';
      return this.map(function(){
          var self = $(this);
          var script = self.data('script');
          if (!script) return null;
          var exprs = $.map(self.socket_blocks(), function(elem, idx){return $(elem).extract_script();});
          var blks = $.map(self.child_blocks(), function(elem, idx){return $(elem).extract_script();});
          if (exprs.length){
              // console.log('expressions: %o', exprs);
              function exprf(match, offset, s){
                  // console.log('%d args: <%s>, <%s>, <%s>', arguments.length, match, offset, s);
                  var idx = parseInt(match.slice(2,-2), 10) - 1;
                  // console.log('index: %d, expression: %s', idx, exprs[idx]);
                  return exprs[idx];
              };
              script = script.replace(/\{\{\d\}\}/g, exprf);
          }
          if (blks.length){
              function blksf(match, offset, s){
                  var idx = parseInt(match.slice(2,-2), 10) - 1;
                  return blks[idx];
              }
              script = script.replace(/\[\[\d\]\]/g, blksf);
          }
          next = self.next_block().extract_script();
          if (script.indexOf('[[next]]') > -1){
              script = script.replace('[[next]]', next);
          }else{
              if (self.is('.step, .trigger')){
                  script = script + '\n' + next;
              }
          }
          return script;
      }).get().join('\n\n');
  },
  wrap_script: function(){
      // wrap the top-level script to prevent leaking into globals
      var script = this.map(function(){return $(this).extract_script();}).get().join('\n\n');
      // TODO: wrap script string, if necessary
      return script;
  },
  write_script: function(view){
      view.html('<code><pre class="script_view">' + this.wrap_script() +  '</pre></code>');
  },
  parent_block: function(){
      var p = this.closest('.wrapper').parent();
      if (p.is('.next')){
          return p.closest('.wrapper');
      }
      return null;
  },
  child_blocks: function(){
      return this.find('> .block > .contained').map(function(){
          var kids = $(this).children('.wrapper');
          if (kids.length){
              return kids;
          }else{
              return $('<span class="empty"></span>');
          }
      });
  },
  socket_blocks: function(){
      return this.find('> .block > .blockhead > label').children('.socket, .autosocket').children('input, select, .wrapper');
  },
  next_block: function(){
      return this.find('> .next > .wrapper');
  },
  moveTo: function(x,y){
      return this.css({left: x + 'px', top: y + 'px'});
  }
});

$.fn.extend({
    block_description: function(){
        if (this.length < 1) return '';
        if (this.is('.empty')) return '';
        if (this.is(':input')){
            return this.val();
        }
        var desc = {
            klass: this.data('klass'),
            label: this.data('label'),
            script: this.data('script'),
            containers: this.data('containers')
        };
        if (this.parent().is('.scripts_workspace')){ desc.offset = this.offset(); }
        // FIXME: Move specific type handling to raphael_demo.js
        if (this.is('.trigger')){ desc.trigger = true; }
        if (this.is('.number')){ desc['type'] = 'number'; }
        if (this.is('.string')){ desc['type'] = 'string'; }
        if (this.is('.boolean')){ desc['type'] = 'boolean'; }
        if (this.is('.color')){ desc['type'] = 'color'; }
        desc.sockets = this.socket_blocks().map(function(){return $(this).block_description();}).get();
        desc.contained = this.child_blocks().map(function(){return $(this).block_description();}).get();
        desc.next = this.next_block().block_description();
        return desc;
    }
});

function Block(options){
    // Options include:
    //
    // Menu blocks subset:
    //
    // label: required (yes, there are required options, deal with it)
    // klass: [control] (for styling)
    // trigger: [false] (is this a trigger?)
    // containers: [0] (how many sub-scripts does this hold?)
    // slot: [true] (can scripts follow this block in sequence?)
    // type: string, number, color, or boolean if this is a value block
    // 
    // Script block additions:
    // 
    // position [0,0] (root blocks only)
    // sockets: array of values or value blocks
    // contained: array of contained blocks
    // next: block that follows this block
    var opts = {
        klass: 'control',
        slot: true, // Something can come after
        trigger: false, // This is the start of a handler
        flap: true, // something can come before
        containers: 0,  // Something cannot be inside
        label: 'Step', // label is its own mini-language
        type: null
    };
    $.extend(opts, options);
    if (opts.trigger){
        opts.flap = false; // can't have both flap and trigger
    }
    if (opts['type']){
        opts.slot = false; // values nest, but do not follow
        opts.flap = false;
    }
    var wrapper = $('<span class="wrapper ' + opts.klass + '"><span class="block"><span class="blockhead"><label>' + Label(opts.label) + '</label></span></span></span>');
    wrapper.data('label', opts.label);
    wrapper.data('klass', opts.klass);
    var block = wrapper.children();
    if (opts['type']){
        block.addClass(opts['type']);
        wrapper.addClass('value').addClass(opts['type']);
    }
    if (opts.trigger){
        wrapper.addClass('trigger');
        block.append('<b class="trigger"></b>');
    }else if(opts.flap){
        block.append('<b class="flap"></b>');
        wrapper.addClass('step');
    }
    for (var i = 0; i < opts.containers; i++){
        block.append('</b><span class="contained"><i class="slot"></i></span>');
    }
    wrapper.data('containers', opts.containers);
    if (opts.slot){
        wrapper.append('<span class="next"><i class="slot"></i></span>');
    }
    if (opts.script){
        wrapper.data('script', opts.script);
    }
    if (opts.sockets){
        $.each(opts.sockets, function(idx, value){
            if ($.isPlainObject(value)){
                var child = Block(value);
                block.find('> .blockhead > label > .socket').eq(idx).empty().append(child);
                child.attr({position: 'relative', left: 0, top: 0});
            }else{ // presumably a string
                var socket = block.find('> .blockhead > label > .socket :input, > .blockhead > label > .autosocket select').eq(idx);
                socket.val(value);
                if (socket.attr('type') === 'color'){
                    socket.css({color: value, 'background-color': value});
                }
            }
        });
    }
    if (opts.contained){
        $.each(opts.contained, function(idx, value){
            if ($.isPlainObject(value)){
                var child = Block(value);
                block.find('> .contained').eq(idx).append(child);
                child.attr({position: 'relative', left: 0, top: 0});
            }
        });
    }
    if (opts.next){
        if ($.isPlainObject(opts.next)){
            var child = Block(opts.next);
            wrapper.find('> .next').append(child);
            child.attr({position: 'relative', left: 0, top: 0});
        }
    }
    // add update handlers
    return wrapper;
}

        
function choice_func(s, listname, default_opt){
    var list = choice_lists[listname];
    return '<span class="string ' + listname + ' autosocket"><select>' + 
        list.map(function(item){
            if (item === default_opt){
                return '<option selected>' + item + '</option>';
            }else{
                return '<option>' + item + '</option>';
            }
        }).join('') +
        '</select></span>';
}
            
function Label(value){
    // Recognize special values in the label string and replace them with 
    // appropriate markup. Some values are dynamic and based on the objects currently
    // in the environment
    //
    // values include:
    //
    // [number] => an empty number socket
    // [number:default] => a number socket with a default value
    // [boolean] => an empty boolean socket
    // [boolean:default] => a boolean with a default value
    // [string] => an empty string socket
    // [string:default] => a string socket with a default value
    // [choice:options] => a fixed set of options, listed in options parameter function
    
    // FIXME: Move specific type handling to raphael_demo.js
    value = value.replace(/\[number:(-?\d*\.?\d+)\]/g, '<span class="number socket"><input type="number" value="$1"></span>');
    value = value.replace(/\[number\]/g, '<span class="number socket"><input type="number"></span>');
    value = value.replace(/\[boolean:(true|false)\]/g, '<span class="boolean socket"><select><option>true</option><option selected>false</option></select></span>');
    value = value.replace(/\[boolean\]/g, '<span class="boolean socket"><select><option>true</option><option>false</option></select></span>');
    value = value.replace(/\[string:(.+?)\]/g, '<span class="string socket"><input value="$1"></span>');
    value = value.replace(/\[string\]/g, '<span class="string socket"><input></span>');
    value = value.replace(/\[color\]/g, '<span class="color socket"><input type="color"></span>');
    value = value.replace(/\[color:(#[01234567890ABCDEF]{6})\]/g, '<span class="color socket"><input type="color" value="$1" style="color:$1;background-color:$1;"></span>');
    value = value.replace(/(?:\[choice\:)(\w+)(?:\:)(\w+)(?:\])/g, choice_func);
    value = value.replace(/(?:\[choice\:)(\w+)(?:\])/g, choice_func);
    return value;
}

