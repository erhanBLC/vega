var Tuple = require('vega-dataflow').Tuple,
    log = require('vega-logging'),
    Transform = require('./Transform'),
    BatchTransform = require('./BatchTransform');

function Lookup(graph) {
  BatchTransform.prototype.init.call(this, graph);
  Transform.addParameters(this, {
    on:      {type: 'data'},
    onKey:   {type: 'field', default: null},
    as:      {type: 'array<value>'},
    keys:    {type: 'array<field>', default: ['data']},
    default: {type: 'value'}
  });

  return this.revises(true).mutates(true);
}

var prototype = (Lookup.prototype = Object.create(BatchTransform.prototype));
prototype.constructor = Lookup;

prototype.batchTransform = function(input, data) {
  log.debug(input, ['lookup']);

  var on = this.param('on'),
      onLast = on.source.last(),
      onData = on.source.values(),
      onKey = this.param('onKey'),
      onF = onKey.field,
      keys = this.param('keys'),
      get = keys.accessor,
      as = this.param('as'),
      defaultValue = this.param('default'),
      lut = this._lut,
      batch = false, i, v;

  // build lookup table on init, withKey modified, or tuple add/rem
  if (lut == null || this._on !== onF || onF && onLast.fields[onF] ||
      onLast.add.length || onLast.rem.length)
  {
    if (onF) { // build hash from withKey field
      onKey = onKey.accessor;
      for (lut={}, i=0; i<onData.length; ++i) {
        lut[onKey(v = onData[i])] = v;
      }
    } else { // otherwise, use index-based lookup
      lut = onData;
    }
    this._lut = lut;
    this._on = onF;
    batch = true;
  }

  function set(t) {
    for (var i=0; i<get.length; ++i) {
      var v = lut[get[i](t)] || defaultValue;
      Tuple.set(t, as[i], v);
    }
  }

  if (batch) {
    // perform batch update if lookup table has changed
    data.forEach(set);
  } else {
    // otherwise, update changeset data only
    input.add.forEach(set);
    var run = keys.field.some(function(f) { return input.fields[f]; });
    if (run) {
      input.mod.forEach(set);
      input.rem.forEach(set); 
    }
  }

  as.forEach(function(k) { input.fields[k] = 1; });
  return input;
};

module.exports = Lookup;

Lookup.schema = {
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "Lookup transform",
  "description": "Extends a data set by looking up values in another data set.",
  "type": "object",
  "properties": {
    "type": {"enum": ["lookup"]},
    "on": {
      "type": "string",
      "description": "The name of the secondary data set on which to lookup values."
    },
    "onKey": {
      "description": "The key field to lookup, or null for index-based lookup.",
      "oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]
    },
    "keys": {
      "description": "One or more fields in the primary data set to match against the secondary data set.",
      "type": "array",
      "items": {"oneOf": [{"type": "string"}, {"$ref": "#/refs/signal"}]}
    },
    "as": {
      "type": "array",
      "description": "The names of the fields in which to store looked-up values.",
      "items": {"type": "string"}
    },
    "default": {
      // "type": "any",
      "description": "The default value to use if a lookup match fails."
    }
  },
  "required": ["type", "on", "as", "keys"],
  "additionalProperties": false
};