/*
 * Frontend for Weathermap editor
 * Vitaly Chekryzhev <13hakta@gmail.com>, 2017
 */

var
  imagesUrl, rra_path, cacti_webpath,
  grid, grid_step, grid_snap, mapObj = {};

var map_canvas = document.getElementById("mapcanvas");
var dContext = map_canvas.getContext("2d");
var offscreenCanvas = document.getElementById("canvasbg");
var offContext = offscreenCanvas.getContext('2d');
var offImage;

var nodeSize = [32, 32];
var scaleSize = [94, 100];
var viaSize = [5, 5];
var textPadding = 2;
var textHeight = 12;
var scaleBlock = [25, 15];
var scalePadding = 1;

var popupOpen = false;
var popup = $('#popup');

// Image cache
var imagesCache = {};
var remainImages = 0;

var map_initial = {
  name: 'noname',
  modified: false,
  selected: {},
  config: {size: [0, 0]},
  templates: [],
  objects: [],
  scales: {},
  fonts: [],
  rendered: []
};

var linkGlobalId = 0;

// Drag helpers
var
  offset,
  dragging = false;
prevPoint = [0, 0];

var opfilterList = null;

// Generic containers
var genericDrawContainer = {};

/*
 * Map
 */
function convertMap() {
  $('#mapinfo').val(convertData(mapObj));
  $('#exportDialog').modal('show');
}

function newMap() {
  if (mapObj.modified && !confirm('Map is modified. Proceed?')) return;

  loadData({
    config: {size: [800, 600], bgcolor: "#FFFFFF", title: "New map"},
    name: 'noname' + Math.floor(Math.random() * 100000)
  });
}

function loadMapList() {
  var olist = $("#maps");
  olist.empty();

  olist.append($('<option disabled>Loading...</option>'));

  $.getJSON('jsm.php', {a: 'list'}, function (data) {
    olist.empty();
    for (let key of data)
      olist.append($('<option>' + key + '</option>'));
  });
}

function selectMap() {
  if (!onlineMode) {
    alert('Offline mode');
    return;
  }

  loadMapList();
  $('#mapList').modal('show');
}

function loadMap() {
  if (mapObj.modified && !confirm('Map is modified. Proceed?')) return;

  var mapName = $("#maps").val();
  if (mapName != '') {
    $('#mapList').modal('hide');
    initialSetup(mapName[0]);
  }
}

/*
 * Fonts
 */
function addFont() {
  var fonts = $('#fonts');
  var key = fonts.find('option').length;

  var id = parseInt($('#mfid').val());
  var face = $('#mfface').val();

  if (id && face) {
    fonts.append($('<option value="' + key + '">[' + id + '] ' + face + '</option>'));
    mapObj.fonts.push({id: id, face: face});
    $('#mfid').val(id + 1);
    $('#mfface').val('');
  }
}

function mapFonts() {
  var key;
  var fonts = $('#fonts');

  fonts.empty();

  for (key in mapObj.fonts)
    fonts.append($('<option value="' + key + '">[' + mapObj.fonts[key].id + '] ' + mapObj.fonts[key].face + '</option>'));

  mapObj.modified = true;
  $('#mapFonts').modal('show');
}

/*
 * Delete from node editor
 */
function deleteLinks() {
  var link, i, key;
  var olist = $("#odLinks");
  var selLinks = olist.val();

  i = selLinks.length - 1;
  while (i >= 0) {
    key = selLinks[i];
    mapObj.objects.splice(key, 1);
    olist.find('[value=' + key + ']').remove();

    i--;
  }

  mapObj.modified = true;
  render();
  reDraw();
}

// Delete from link editor
function deleteLink() {
  var linkID = $('#olIndex').val();

  mapObj.objects.splice(linkID, 1);

  $('#editorLink').modal('hide');
  mapObj.modified = true;
  render();
  reDraw();
}

/*
 * Render nodes and links with recursive templating
 */
function render() {
  var obj, tpl, defaultNodeId, defaultLinkId, item;
  mapObj.rendered = [];

  // Find DEFAULT templates
  defaultNodeId = getNodeById(mapObj.templates, 'DEFAULT');
  defaultLinkId = getNodeById(mapObj.templates, 'DEFAULT', 'link');

  for (var i in mapObj.objects) {
    obj = {};

    var t, lookup = i, recurse = 0;

    item = mapObj.objects[lookup];
    if ((item.type != 'node') && (item.type != 'link')) {
      mapObj.rendered.push(mapObj.objects[i]);
      continue;
    }

    tpl = item.template;

    // Attach default templates
    if ((item.type == 'node') && (defaultNodeId != null))
      obj = $.extend(true, obj, mapObj.templates[defaultNodeId]);

    if (item.type == 'link') {
      if (defaultLinkId != null)
        obj = $.extend(true, obj, mapObj.templates[defaultLinkId]);

      // Set helper IDs
      obj.nodesID = [
        getNodeById(mapObj.objects, item.nodes[0]),
        getNodeById(mapObj.objects, item.nodes[1])];
    }

    // Recursive apply templates for templates
    while (tpl) {
      tplID = getNodeById(mapObj.templates, tpl, item.type);

      if (tplID) {
        t = mapObj.templates[tplID];
        obj = $.extend(true, obj, t);

        lookup = tplID;

        if (++recurse == 3) break; // stop recursion
        tpl = t.template;
      } else {
        console.error('No template', tpl);
        break;
      }
    }

    obj = $.extend(true, obj, mapObj.objects[i]);
    mapObj.rendered.push(obj);
  }
}

/*
 * Cache images from background, templates and nodes
 */
function loadImages() {
  var image;

  console.log('Caching images');
  remainImages = 0;

  // Cache background image
  if (mapObj.config.bg)
    if (!imagesCache[mapObj.config.bg]) {
      console.log('Load', mapObj.config.bg);

      image = new Image();

      image.onerror = function () {
        console.error('Can\'t load:', mapObj.config.bg);
        delete imagesCache[mapObj.config.bg];

        if (--remainImages == 0) reDraw();
      };

      image.onload = function () {
        drawBackground();

        if (--remainImages == 0) {
          reDraw();
        }
      };

      image.src = imagesUrl + mapObj.config.bg;
      remainImages++;

      imagesCache[mapObj.config.bg] = image;
    }

  // Retrieve images for nodes and templates
  var objs = $.extend(true, {}, mapObj.objects, mapObj.templates);

  // Cache node icons
  for (var i in objs) {
    var obj = objs[i];
    // if (obj.type == "node") {
    if (obj.img && !imagesCache[obj.img]) {
      image = new Image();
      image.setAttribute('data-idx', i);

      image.onerror = function () {
        var obj = objs[image.getAttribute('data-idx')];
        console.error('Can\'t load:', obj.img);

        delete imagesCache[obj.img];

        if (--remainImages == 0) reDraw();
      };

      image.onload = function () {
        if (--remainImages == 0) reDraw();
      };

      image.src = imagesUrl + obj.img;
      remainImages++;

      imagesCache[obj.img] = image;
    }
    // }
  }

  return (remainImages == 0);
}

function setSize() {
  map_canvas.width = mapObj.config.size[0];
  map_canvas.height = mapObj.config.size[1];
  offscreenCanvas.width = mapObj.config.size[0];
  offscreenCanvas.height = mapObj.config.size[1];
}

/*
 * Utilities
 */

function checkFormField(e) {
  if (e.target.hasAttribute('pattern') || e.target.hasAttribute('required')) {
    if (e.target.checkValidity())
      $(e.target).removeClass('is-invalid');
    else
      $(e.target).addClass('is-invalid');
  }
}

function fillFontSelect(objref, value) {
  var obj = $(objref);
  obj.empty();

  obj.append($('<option value="">[default]</option>' +
    '<option value="1">[1]</option>' +
    '<option value="2">[2]</option>' +
    '<option value="3">[3]</option>' +
    '<option value="4">[4]</option>' +
    '<option value="5">[5]</option>'));

  for (let font of mapObj.fonts)
    obj.append($('<option value="' + font.id + '">[' + font.id + '] ' + font.face + '</option>'));

  obj.val(value);
}

function fillTemplateSelect(objref, type, value) {
  var obj = $(objref);
  obj.empty();

  obj.append($('<option value="">[default]</option>'));

  var objArray = mapObj.templates.filter(function (obj) {
    return ((obj.type == type) && (obj.id != 'DEFAULT'));
  });

  for (key in objArray)
    obj.append($('<option>' + objArray[key].id + '</option>'));

  obj.val(value);
}

function getNodeById(objects, id, type = 'node') {
  for (var i in objects) {
    var obj = objects[i];

    if (obj.type == type && obj.id == id)
      return i;
  }

  return null;
}

// Get associated links
function getLinksForNode(node) {
  var key;
  var result = [];

  for (key in mapObj.objects) {
    if (mapObj.objects[key].type != 'link') continue;

    if (mapObj.objects[key].nodes[0] == node)
      result.push(key);

    if (mapObj.objects[key].nodes[1] == node)
      result.push(key);
  }

  return result;
}

function getNodeFromPoint(x, y) {
  var objSize, off;

  for (var i in mapObj.objects) {
    var obj = mapObj.objects[i];

    if (!obj.pos) continue;
    off = 0;

    switch (obj.type) {
      case "node":
        if (imagesCache[obj.img]) {
          objSize = [imagesCache[obj.img].width, imagesCache[obj.img].height];
        } else
          objSize = nodeSize;

        if (
          (x >= obj.pos[0] - objSize[0] / 2) &&
          (x <= obj.pos[0] + objSize[0] / 2) &&
          (y >= obj.pos[1] - objSize[1] / 2) &&
          (y <= obj.pos[1] + objSize[1] / 2))
          return i;
        break;

      case "time":
        dContext.font = mapObj.fontsR[(mapObj.config.timefont) ? mapObj.config.timefont : defFont.time];
        objSize = [dContext.measureText(obj.fmt).width, 20];
        off = textPadding + textHeight;
        break;

      case "title":
        dContext.font = mapObj.fontsR[(mapObj.config.titlefont) ? mapObj.config.titlefont : defFont.title];
        objSize = [dContext.measureText(mapObj.config.title).width, 20];
        off = textPadding + textHeight;
        break;

      case "scale":
        objSize = scaleSize;
        objSize[1] = 30 + scaleBlock[1] * mapObj.scales[obj.id].length;
        break;
    }

    if (
      (x >= obj.pos[0]) &&
      (x <= obj.pos[0] + objSize[0]) &&
      (y >= obj.pos[1] - off) &&
      (y <= obj.pos[1] + objSize[1] - off))
      return i;
  }

  return null;
}

function selectPoint(x, y, reset) {
  var objSize, off,
    sel = false;
  selectable = false;

  genericDrawContainer['debug'] = {fn: 'fillText', args: [`Selected point (${x},${y})`, 10, 10]}
  // dContext.fillText(`Selected point (${x},${y})`,
  //   10,
  //   10);

  if (reset)
    mapObj.selected = {};

  for (var i in mapObj.objects) {
    var obj = mapObj.objects[i];
    if (!obj.pos) continue;
    selectable = false;
    off = 0;

    switch (obj.type) {
      case "node":
        objSize = (imagesCache[obj.img]) ? [imagesCache[obj.img].width, imagesCache[obj.img].height] : nodeSize;
        if (
          (x >= obj.pos[0] - objSize[0] / 2) &&
          (x <= obj.pos[0] + objSize[0] / 2) &&
          (y >= obj.pos[1] - objSize[1] / 2) &&
          (y <= obj.pos[1] + objSize[1] / 2)) {
          if (reset)
            mapObj.selected[i] = true;
          else if (mapObj.selected[i])
            delete mapObj.selected[i];
          else
            mapObj.selected[i] = true;
          sel = true;
        }
        break;

      case "scale":
        objSize = scaleSize;
        objSize[1] = 30 + scaleBlock[1] * mapObj.scales[obj.id].length;
        selectable = true;
        break;

      case "time":
        dContext.font = mapObj.fontsR[(mapObj.config.timefont) ? mapObj.config.timefont : defFont.time];
        objSize = [dContext.measureText(obj.fmt).width, 20];
        off = textPadding + textHeight;
        selectable = true;
        break;

      case "title":
        dContext.font = mapObj.fontsR[(mapObj.config.titlefont) ? mapObj.config.titlefont : defFont.title];
        objSize = [dContext.measureText(mapObj.config.title).width, 20];
        off = textPadding + textHeight;
        selectable = true;
        break;

      // Via dot drawn in the middle and requires special handle
      case "link":
        for (var j in obj.pos) {
          if (
            (x >= obj.pos[j][0] - viaSize[0] / 2) &&
            (x <= obj.pos[j][0] + viaSize[0] / 2) &&
            (y >= obj.pos[j][1] - viaSize[1] / 2) &&
            (y <= obj.pos[j][1] + viaSize[1] / 2)) {
            mapObj.objects.push({type: 'via', pos: obj.pos[j], obj: i, idx: j});
            mapObj.selected[mapObj.objects.length - 1] = true;
            sel = true;
            break;
          }
        }
        continue;
        break;
    }

    if (selectable &&
      (x >= obj.pos[0]) &&
      (x <= obj.pos[0] + objSize[0]) &&
      (y >= obj.pos[1] - off) &&
      (y <= obj.pos[1] + objSize[1] - off)) {
      if (reset)
        mapObj.selected[i] = true;
      else if (mapObj.selected[i])
        delete mapObj.selected[i];
      else
        mapObj.selected[i] = true;
      sel = true;
    }
  }

  if ((reset && !sel) || sel)
    reDraw();
}

function selectImage(e) {
  var imglist = $("#odImages");
  $('#odimage').val(imglist.val());
}

function selectBgImage(e) {
  var imglist = $("#mpbackgroundimages");
  $('#mpbackground').val(imglist.val());
}

/*
 * Dragging
 */
function mouseMove(e) {
  if (dragging) {
    var point = [
      e.pageX - offset.left,
      e.pageY - offset.top
    ];

    for (var i in mapObj.selected) {
      var obj = mapObj.objects[i];

      switch (obj.type) {
        case "title":
        case "time":
        case "scale":
        case "node":
          obj.pos[0] -= prevPoint[0] - point[0];
          obj.pos[1] -= prevPoint[1] - point[1];
          break;

        case "via":
          mapObj.objects[obj.obj].pos[obj.idx][0] -= prevPoint[0] - point[0];
          mapObj.objects[obj.obj].pos[obj.idx][1] -= prevPoint[1] - point[1];

        case "link":
          for (let pos of obj.pos) {
            pos[0] -= prevPoint[0] - point[0];
            pos[1] -= prevPoint[1] - point[1];
          }
          break;
      }
    }

    // Speedup drawing
    if (qq >= oddframe) {
      reDraw();
      qq = 0;
    }
    qq++;

    prevPoint = point;
  }
}

function mouseDown(e) {
  if (e.button != 0) return;

  if (popupOpen) {
    popup.hide();
    popupOpen = false;
  }

  var key;
  var point = [
    e.pageX - offset.left,
    e.pageY - offset.top
  ];

  if (e.ctrlKey) {
    selectPoint(point[0], point[1], false);
  } else {
    mapObj.selected = {};
    selectPoint(point[0], point[1], true);

    if (Object.keys(mapObj.selected).length > 0) {
      dragging = true;

      // Select links for nodes
      var linkArr = [];
      for (var i in mapObj.selected) {
        var obj = mapObj.objects[i];

        switch (obj.type) {
          case "node":
            var links = getLinksForNode(obj.id);
            for (var link of links) {
              if (mapObj.objects[link].pos)
                linkArr.push(link);
            }
            break;
        }
      }

      for (let link of linkArr)
        mapObj.selected[link] = true;
    }

    prevPoint = point;
  }
}

function mouseUp(e) {
  if (dragging) {
    dragging = false;
    mapObj.modified = true;

    // Snap to grid
    if (grid_snap) {
      for (var i in mapObj.selected) {
        var obj = mapObj.objects[i];

        switch (obj.type) {
          case "title":
          case "time":
          case "scale":
          case "node":
            obj.pos[0] = Math.round(obj.pos[0] / grid_step) * grid_step;
            obj.pos[1] = Math.round(obj.pos[1] / grid_step) * grid_step;

            break;
        }
      }
    }

    // Clear from shadowed via points
    var cleared = mapObj.objects.filter(function (obj) {
      return (obj.type != 'via');
    });
    mapObj.objects = cleared;

    reDraw();
  }
}

function menuAddTime(sub) {
  var times = $.grep(mapObj.objects, function (o, i) {
    return ((o.type == "time") && (o.sub == sub));
  });

  if (times.length > 0) {
    alert('Time object is already present on this map');
    return;
  }

  mapObj.objects.push({
    type: "time",
    pos: [parseInt(popup.attr('data-x')), parseInt(popup.attr('data-y'))],
    fmt: ["Generated", "Min", "Max"][sub] + ": %b %d %Y %H:%M:%S",
    sub: sub
  });

  popup.hide();
  popupOpen = false;

  mapObj.modified = true;
  render();
  reDraw();
}

function menuAddTitle() {
  var titles = $.grep(mapObj.objects, function (o, i) {
    return ((o.type == "title"));
  });

  if (titles.length > 0) {
    alert('Title object is already present on this map');
    return;
  }

  mapObj.objects.push({type: "title", pos: [parseInt(popup.attr('data-x')), parseInt(popup.attr('data-y'))]});

  popup.hide();
  popupOpen = false;

  mapObj.modified = true;
  render();
  reDraw();
}

function menuAdd() {
  var id = Object.keys(mapObj.objects).length + 1;

  mapObj.objects.push({
      type: "node",
      id: "node" + id,
      pos: [parseInt(popup.attr('data-x')), parseInt(popup.attr('data-y'))],
      title: "Node #" + id
    },
  );

  popup.hide();
  popupOpen = false;

  mapObj.modified = true;
  render();
  if (loadImages()) reDraw();
}

function menuLink(mode) {
  var i, nodes = 0;
  var keys = Object.keys(mapObj.selected);

  // How many nodes in selected objects?
  for (i in keys) {
    if (mapObj.objects[keys[i]].type == 'node')
      nodes++;
  }

  if (nodes == 2) {
    var link = {
      id: linkGlobalId++,
      type: 'link',
      nodes:
        [
          mapObj.objects[keys[0]].id,
          mapObj.objects[keys[1]].id
        ]
    }

    if (mode == 1) {
      var x = (mapObj.objects[keys[1]].pos[0] + mapObj.objects[keys[0]].pos[0]) / 2;
      var y = (mapObj.objects[keys[1]].pos[1] + mapObj.objects[keys[0]].pos[1]) / 2;
      link.pos = [[x, y]];
    }

    mapObj.objects.push(link);
  } else {
    alert('Select 2 nodes at first');
    return;
  }

  mapObj.modified = true;
  render();
  reDraw();

  popup.hide();
  popupOpen = false;
}

function menuDelete() {
  if (confirm('Are you sure to delete?')) {
    var objIdx = popup.attr('data-idx');

    var obj = mapObj.objects[objIdx];

    switch (obj.type) {
      case "title":
      case "scale":
      case "time":
        mapObj.objects.splice(objIdx, 1);
        break;

      case "node":
        var objId = mapObj.objects[objIdx].id;

        mapObj.objects.splice(objIdx, 1);
        var newList = mapObj.objects.filter(function (el) {
          return (
            (el.type != "link") || ((el.type == "link") &&
              (el.nodes[0] != objId) &&
              (el.nodes[1] != objId))
          );
        });
        mapObj.objects = newList
        break;
    }

    mapObj.selected = {};

    mapObj.modified = true;
    render();
    reDraw();
  }

  popup.hide();
  popupOpen = false;
}

function menuClone() {
  var objIdx = popup.attr('data-idx');
  var obj = mapObj.objects[objIdx];

  if (obj.type == 'node') {
    var newNode = $.extend(true, {}, obj);

    // Get unique id
    var i = 0;
    while (getNodeById(newNode.id + '_copy' + i++)) {
    }
    newNode.id += '_copy' + i;

    newNode.pos[0] += 50;
    newNode.pos[1] += 50;
    mapObj.objects.push(newNode);
  }

  render();
  reDraw();

  popup.hide();
  popupOpen = false;
}

function menuEdit() {
  var key, obj;

  var objIdx = popup.attr('data-idx');

  var objSource = parseInt(popup.attr('data-src'));

  if (objSource == 0)
    obj = mapObj.templates[objIdx];
  else
    obj = mapObj.objects[objIdx];

  switch (obj.type) {
    case "node":
      $('#odIndex').val(objIdx);
      $('#odname').val(obj.id);
      $('#odtitle').val(obj.title);
      $('#odimage').val(obj.img);
      $('#odcacti').val(obj.cacti);
      $('#odtemplate').val(obj.template);
      $('#odcolor').val(obj.color);
      $('#odoutcolor').val(obj.outcolor);
      $('#odbcolor').val(obj.lbg);
      if (Array.isArray(obj.loffset)) {
        $('#odlabeloff').val('custom');
        $('#odlabeloffcustom').show();
        $('#odlabeloffx').val(obj.loffset[0]);
        $('#odlabeloffy').val(obj.loffset[1]);
      } else {
        $('#odlabeloffcustom').hide();
        $('#odlabeloff').val(obj.loffset);
      }
      $('#odlabeloff').change(function () {
        var val = $('#odlabeloff').val();
        if (val === 'custom') {
          $('#odlabeloffcustom').show();
        } else {
          $('#odlabeloffcustom').hide();
        }

      })
      $('#odnotes').val(obj.notes);
      $('#odmax').val(obj.max);

      // $('#oddata').val(obj.data);
      $('#odinfo').val(obj.info);
      $('#odhover').val(obj.hover);

      $('#odovercap').val(obj.overcap);
      $('#odoverwidth').val(obj.overwidth);
      $('#odoverheight').val(obj.overheight);

      $("#odImages").val('');

      if (!onlineMode) {
        var olist = $("#odImages");
        olist.empty();
        olist.append($('<option value="">Select from list</option>'));

        for (key in imagesCache)
          olist.append($('<option>' + key + '</option>'));
      }

      // Get associated links
      var olist = $("#odLinks");
      olist.empty();

      if (objSource == 1) {
        for (key in mapObj.objects) {
          if (mapObj.objects[key].type != 'link') continue;

          var parser = (key, olist, node1, node2) => {
            var from = mapObj.objects[getNodeById(mapObj.objects, mapObj.objects[key].nodes[node1])];
            var to = mapObj.objects[getNodeById(mapObj.objects, mapObj.objects[key].nodes[node2])];
            var message = `${from.title}(${mapObj.objects[key].nodes[node1]}) - ${to.title}(${mapObj.objects[key].nodes[node2]}) - id: ${mapObj.objects[key].id}`
            olist.append($('<option value="' + key + '">' + message + '</option>'));
          }

          if (mapObj.objects[key].nodes[0] == obj.id) {
            parser(key, olist, 0, 1)
          }

          if (mapObj.objects[key].nodes[1] == obj.id) {
            parser(key, olist, 1, 0)
          }
        }
      }

      fillTemplateSelect('#odtemplate', 'node', obj.template);
      fillFontSelect('#odlabfont', obj.font);

      $('#tabsn a:first').tab('show');
      $('#editorNode').modal('show');
      break;

    case "time":
      $('#otIndex').val(objIdx);
      $('#otformat').val(obj.fmt);
      $('#editorTime').modal('show');
      break;

    case "scale":
      $('#editorScale').modal('show');
      break;
  }

  popup.hide();
  popupOpen = false;
}

function clearVIA() {
  var linkID = $('#olIndex').val();

  $('#olviastyle').val('');
  delete mapObj.objects[linkID].pos;
  delete mapObj.objects[linkID].via;

  reDraw();
}

function addVIA() {
  var linkID = $('#olIndex').val();

  var x = Math.floor(Math.random() * (mapObj.config.size[0] / 2));
  var y = Math.floor(Math.random() * (mapObj.config.size[1] / 2));

  if (mapObj.objects[linkID].pos)
    mapObj.objects[linkID].pos.push([x, y]);
  else
    mapObj.objects[linkID].pos = [[x, y]];

  reDraw();
}

function showMapConfig() {
  $('#mpname').val(mapObj.config.title);
  $('#mpwidth').val(mapObj.config.size[0]);
  $('#mpheight').val(mapObj.config.size[1]);
  $('#mpcolor').val(mapObj.config.bgcolor);
  $('#mpbackground').val(mapObj.config.bg);
  $('#mpimage').val(mapObj.config.outimage);
  $('#mphtml').val(mapObj.config.outhtml);
  $('#mpcss').val(mapObj.config.css);

  $('#mptcolor').val(mapObj.config.titlecolor);
  $('#mptmcolor').val(mapObj.config.timecolor);
  $('#mpkcolor').val(mapObj.config.keycolor);
  $('#mpkocolor').val(mapObj.config.keyoutcolor);
  $('#mpkbcolor').val(mapObj.config.keybgcolor);

  fillFontSelect('#mptfont', mapObj.config.titlefont);
  fillFontSelect('#mptmfont', mapObj.config.timefont);
  fillFontSelect('#mpsfont', mapObj.config.keyfont);

  $('#mapext').val(mapObj.config.ext);

  $('#mapConfig').modal('show');
}

function applyLink() {
  var obj;
  var linkID = $("#olIndex").val();

  var objSource = parseInt(popup.attr('data-src'));

  if (objSource == 0)
    obj = mapObj.templates[linkID];
  else
    obj = mapObj.objects[linkID];

  obj.id = $('#olid').val();
  obj.speed = $('#olbwidth').val();
  obj.width = $('#olwidth').val();

  obj.duplex = $('#olduplex').val();
  obj.template = $('#oltemplate').val();
  obj.scale = $('#olscale').val();
  obj.scalet = $('#olscalet').val();
  obj.data = $('#oldata').val();
  obj.info = $('#olinfo').val();
  obj.hover = $('#olhover').val();
  obj.notes = $('#olnotes').val();
  obj.comment = $('#olcomment').val();

  obj.arrow = $('#olarrowstyle').val();
  obj.link = $('#ollinkstyle').val();
  obj.bwlabel = $('#olbwlabel').val();
  obj.outcolor = $('#oloutcolor').val();
  obj.bwoutcolor = $('#olbandoutcolor').val();
  obj.bwboxcolor = $('#olbandboxcolor').val();
  obj.bwfont = $('#olbwlabelfont').val();
  obj.ext = $('#linkext').val();

  obj.overcap = $('#olovercap').val();
  obj.overwidth = $('#oloverwidth').val();
  obj.overheight = $('#oloverheight').val();

  obj.via = parseInt($('#olviastyle').val());
  var olnode1cVal = $('#olnode1c').val()
  if (olnode1cVal === 'custom') {
    olnode1cVal = [Number($('#olnode1cx').val()), Number($('#olnode1cy').val())];
  } else {
    olnode1cVal = $('#olnode1c').val();
  }

  var olnode2cVal = $('#olnode2c').val()
  if (olnode2cVal === 'custom') {
    olnode2cVal = [Number($('#olnode2cx').val()), Number($('#olnode2cy').val())];
  } else {
    olnode2cVal = $('#olnode2c').val();
  }
  obj.attach = [olnode1cVal, olnode2cVal]

  // Check & cleanup
  if (obj.duplex == '') delete obj.duplex;
  if (obj.template == '') delete obj.template;
  if (obj.scale == '') delete obj.scale;
  if (obj.scalet == '') delete obj.scalet;

  if (obj.data == '') delete obj.data;
  if (obj.info == '') delete obj.info;
  if (obj.hover == '') delete obj.hover;

  if (obj.arrow == '') delete obj.arrow;
  if (obj.link == '') delete obj.link;
  if (obj.bwlabel == '') delete obj.bwlabel;
  if (obj.outcolor == '') delete obj.outcolor;
  if (obj.bwoutcolor == '') delete obj.bwoutcolor;
  if (obj.bwboxcolor == '') delete obj.bwboxcolor;
  if (obj.bwfont == '') delete obj.bwfont;
  if (obj.notes == '') delete obj.notes;
  if (obj.comment == '') delete obj.comment;
  if (obj.ext == '') delete obj.ext;
  if (!obj.via) delete obj.via;

  if (obj.overcap == '') delete obj.overcap;
  if (obj.overwidth == '') delete obj.overwidth;
  if (obj.overheight == '') delete obj.overheight;

  if (((obj.attach[0] == '') && (obj.attach[1] == '')) ||
    ((obj.attach[0] == 'C') && (obj.attach[1] == 'C')))
    delete obj.attach;

  mapObj.modified = true;
  $('#editorLink').modal('hide');
  render();
  reDraw();
}

function applyMap() {
  mapObj.config.bgcolor = $('#mpcolor').val();
  mapObj.config.bg = $('#mpbackground').val();

  mapObj.config.title = $('#mpname').val();
  mapObj.config.size[0] = $('#mpwidth').val();
  mapObj.config.size[1] = $('#mpheight').val();
  setSize();

  mapObj.config.outimage = $('#mpimage').val();
  mapObj.config.outhtml = $('#mphtml').val();
  mapObj.config.css = $('#mpcss').val();

  mapObj.config.titlecolor = $('#mptcolor').val();
  mapObj.config.timecolor = $('#mptmcolor').val();

  mapObj.config.keycolor = $('#mpkcolor').val();
  mapObj.config.keyoutcolor = $('#mpkocolor').val();
  mapObj.config.keybgcolor = $('#mpkbcolor').val();

  mapObj.config.titlefont = $('#mptfont').val();
  mapObj.config.keyfont = $('#mpsfont').val();
  mapObj.config.timefont = $('#mptmfont').val();

  mapObj.config.ext = $('#mapext').val();

  // Check & cleanup
  if (mapObj.config.bg == '') delete mapObj.config.bg;
  if (mapObj.config.bgcolor == '') delete mapObj.config.bgcolor;
  if (mapObj.config.css == '') delete mapObj.config.css;
  if (mapObj.config.outhtml == '') delete mapObj.config.outhtml;
  if (mapObj.config.outimage == '') delete mapObj.config.outimage;
  if (mapObj.config.titlefont == '') delete mapObj.config.titlefont;
  if (mapObj.config.titlecolor == '') delete mapObj.config.titlecolor;
  if (mapObj.config.timecolor == '') delete mapObj.config.timecolor;
  if (mapObj.config.timefont == '') delete mapObj.config.timefont;

  if (mapObj.config.keyfont == '') delete mapObj.config.keyfont;
  if (mapObj.config.keycolor == '') delete mapObj.config.keycolor;
  if (mapObj.config.keybgcolor == '') delete mapObj.config.keybgcolor;
  if (mapObj.config.keyoutcolor == '') delete mapObj.config.keyoutcolor;

  $('#mapConfig').modal('hide');

  mapObj.modified = true;
  drawBackground();
  if (loadImages()) reDraw();
}

function applyChanges() {
  var obj;

  var objIdx = $('#odIndex').val();

  var objSource = parseInt(popup.attr('data-src'));

  if (objSource == 0)
    obj = mapObj.templates[objIdx];
  else
    obj = mapObj.objects[objIdx];

  obj.title = $('#odtitle').val();
  obj.img = $('#odimage').val();
  obj.cacti = $('#odcacti').val();
  obj.template = $('#odtemplate').val();

  obj.color = $('#odcolor').val();
  obj.outcolor = $('#odoutcolor').val();
  obj.lbg = $('#odbcolor').val();

  if ($('#odlabeloff').val() === 'custom') {
    obj.loffset = [Number($('#odlabeloffx').val()), Number($('#odlabeloffy').val())];
  } else {
    obj.loffset = $('#odlabeloff').val();
  }
  obj.font = $('#odlabfont').val();
  obj.notes = $('#odnotes').val();

  obj.data = $('#oddata').val();
  obj.info = $('#odinfo').val();
  obj.hover = $('#odhover').val();
  obj.max = $('#odmax').val();

  obj.overcap = $('#odovercap').val();
  obj.overwidth = $('#odoverwidth').val();
  obj.overheight = $('#odoverheight').val();

  var newID = $('#odname').val();

  if (objSource == 1) {
    // Update links if ID changed
    if (newID != obj.id) {
      for (key in mapObj.objects) {
        if (mapObj.objects[key].type != 'link') continue;

        if (mapObj.objects[key].nodes[0] == obj.id)
          mapObj.objects[key].nodes[0] = newID;

        if (mapObj.objects[key].nodes[1] == obj.id)
          mapObj.objects[key].nodes[1] = newID;
      }

      obj.id = newID;
    }
  } else obj.id = newID;

  // Cleanup object
  if (obj.loffset == '') delete obj.loffset;
  if (obj.template == '') delete obj.template;
  if (obj.data == '') delete obj.data;
  if (obj.img == '') delete obj.img;
  if (obj.info == '') delete obj.info;
  if (obj.color == '') delete obj.color;
  if (obj.outcolor == '') delete obj.outcolor;
  if (obj.lbg == '') delete obj.lbg;
  if (obj.hover == '') delete obj.hover;
  if (obj.max == '') delete obj.max;
  if (obj.overcap == '') delete obj.overcap;
  if (obj.overwidth == '') delete obj.overwidth;
  if (obj.overheight == '') delete obj.overheight;
  if (obj.ext == '') delete obj.ext;
  if (obj.notes == '') delete obj.notes;

  $('#editorNode').modal('hide');
  mapObj.modified = true;
  render();
  if (loadImages()) reDraw();
}

function editLink() {
  var obj;
  var linkID;

  var objSource = parseInt(popup.attr('data-src'));

  if (objSource == 0) {
    linkID = $('#olIndex').val();
    obj = mapObj.templates[linkID];
  } else {
    linkID = $("#odLinks").val();
    $('#olIndex').val(linkID);
    obj = mapObj.objects[linkID];
  }

  if (linkID != '') {
    $('#olid').val(obj.id);
    $('#olbwidth').val(obj.speed);
    $('#olwidth').val(obj.width);

    $('#olduplex').val(obj.duplex);
    $('#oltemplate').val(obj.template);
    $('#olscale').val(obj.scale);
    $('#olscalet').val(obj.scalet);
    $('#oldata').val(obj.data);
    $('#olinfo').val(obj.info);
    $('#olhover').val(obj.hover);
    $('#olviastyle').val(obj.via);

    $('#olarrowstyle').val(obj.arrow);
    $('#ollinkstyle').val(obj.link);
    $('#olbwlabel').val(obj.bwlabel);
    $('#oloutcolor').val(obj.outcolor);
    $('#olbandoutcolor').val(obj.bwoutcolor);
    $('#olbandboxcolor').val(obj.bwboxcolor);
    $('#olbwlabelfont').val(obj.bwlabelfont);
    $('#olnotes').val(obj.notes);
    $('#olcomment').val(obj.comment);
    $('#linkext').val(obj.ext);

    $('#olovercap').val(obj.overcap);
    $('#oloverwidth').val(obj.overwidth);
    $('#oloverheight').val(obj.overheight);

    if (obj.attach) {
      // $('#olnode1c').val(obj.attach[0]);
      if (Array.isArray(obj.attach[0])) {
        $('#olnode1c').val('custom');
        $('#olnode1ccustom').show();
        $('#olnode1cx').val(obj.attach[0][0]);
        $('#olnode1cy').val(obj.attach[0][1]);
      } else {
        $('#olnode1ccustom').hide();
        $('#olnode1c').val(obj.attach[0]);
      }


      // $('#olnode2c').val(obj.attach[1]);
      if (Array.isArray(obj.attach[1])) {
        $('#olnode2c').val('custom');
        $('#olnode2ccustom').show();
        $('#olnode2cx').val(obj.attach[1][0]);
        $('#olnode2cy').val(obj.attach[1][1]);
      } else {
        $('#olnode2ccustom').hide();
        $('#olnode2c').val(obj.attach[1]);
      }

    } else {
      $('#olnode1ccustom').hide();
      $('#olnode2ccustom').hide();
    }
    $('#olnode1c').change(function () {
      var val = $('#olnode1c').val();
      if (val === 'custom') {
        $('#olnode1ccustom').show();
      } else {
        $('#olnode1ccustom').hide();
      }

    })
    $('#olnode2c').change(function () {
      var val = $('#olnode2c').val();
      if (val === 'custom') {
        $('#olnode2ccustom').show();
      } else {
        $('#olnode2ccustom').hide();
      }

    })

    fillFontSelect('#olbwlabelfont', obj.bwfont);
    fillTemplateSelect('#oltemplate', 'link', obj.template);

    if (objSource == 1)
      $('#linktitle').html(
        mapObj.objects[getNodeById(mapObj.objects, mapObj.objects[linkID].nodes[0])].id +
        ' &dash; ' +
        mapObj.objects[getNodeById(mapObj.objects, mapObj.objects[linkID].nodes[1])].id);
    else
      $('#linktitle').html('Link template');

    $('#editorNode').modal('hide');
    $('#tabsl a:first').tab('show');
    $('#editorLink').modal('show');
  }
}

function deleteMap() {
  if (!confirm('Are you sure to delete?')) return;

  var mapName = $("#maps").val();
  if (mapName != '')
    $.post('jsm.php', {a: "delete", name: mapName[0]}, function (data) {
      loadMapList();
    });
}

function align(mode) {
  var keys = Object.keys(mapObj.selected);

  // Get only nodes
  keys = keys.filter(function (value) {
    return (mapObj.objects[value].type == 'node');
  });

  if (keys.length < 2) {
    alert('Select at least 2 objects at first');
    return;
  }

  // Align respecting first selected node
  var reference = mapObj.objects[keys[0]];

  for (var i = 1; i < keys.length; i++) {
    var obj = mapObj.objects[keys[i]];

    switch (mode) {
      case 0:
        obj.pos[0] = reference.pos[0];
        break;

      case 1:
        obj.pos[1] = reference.pos[1];
        break;
    }
  }

  popup.hide();
  popupOpen = false;

  mapObj.modified = true;
  reDraw();
}

function enterData(obj) {
  var data_id = $(obj).attr('data-src');

  var data_graph = $(obj).attr('data-graph');
  var data_details = $(obj).attr('data-details');

  var rra = $(obj).attr('data-rra');
  if (rra) rra = rra.replace('<path_rra>', rra_path);

  var dialog = $('#pickDialog');

  // Set RRA
  $(dialog.attr('data-data')).val(rra);
  dialog.removeAttr('data-data');

  if ($('#opinfo').prop('checked')) {

    var data_graph = $(obj).attr('data-graph');
    var data_details = $(obj).attr('data-details');
    // var graph_id = data[0];
    // if (!graph_id) {
    //   alert('Error occured');
    //   return;
    // }

    $(dialog.attr('data-info')).val(data_details);
    $(dialog.attr('data-hover')).val(data_graph);

    $(dialog.attr('data-caller')).modal('show');

    dialog
      .removeAttr('data-info')
      .removeAttr('data-hover')
      .removeAttr('data-caller')
      .modal('hide');
    // $.getJSON('jsm.php', {a: "graph", data: data_id},
    //   function (data) {
    //     var graph_id = data[0];
    //     if (!graph_id) {
    //       alert('Error occured');
    //       return;
    //     }
    //
    //     $(dialog.attr('data-info')).val(cacti_webpath + '/graph.php?rra_id=all&local_graph_id=' + graph_id);
    //     $(dialog.attr('data-hover')).val(cacti_webpath + '/graph_image.php?rra_id=0&graph_nolegend=true&graph_height=100&graph_width=300&local_graph_id=' + graph_id);
    //
    //     $(dialog.attr('data-caller')).modal('show');
    //
    //     dialog
    //       .removeAttr('data-info')
    //       .removeAttr('data-hover')
    //       .removeAttr('data-caller')
    //       .modal('hide');
    //   });
  } else {
    $(dialog.attr('data-caller')).modal('show');

    dialog
      .removeAttr('data-caller')
      .modal('hide');
  }
}

function expandTab(hostId, id, filter) {
  $.getJSON('jsm.php', {a: "data", dev: hostId, filter},
    function (data) {
      var content = 'Empty';
      if (Object.keys(data).length > 0) {
        content = '<ul class="list-group small">';

        for (i in data) {
          var detail = data[i];
          content += `
                     <li class="list-group-item">
                        <a href="#"  data-graph="${detail[3]}" data-details="${detail[4]}"  data-src="${detail[0]}" data-rra="${detail[2]}" onclick="enterData(this)">
                            ${detail[1]}
                        </a>
                     </li>`;
        }
        content += '</ul>';
      }

      $(`#content${id}`).html(content);

    });
}

function selectHost(hostID, hover = '', info = '') {
  var dialog = $('#pickDialog');

  $(dialog.attr('data-data')).val(hostID);
  $(dialog.attr('data-hover')).val(hover);
  $(dialog.attr('data-info')).val(info);
  $(dialog.attr('data-name')).val(`Node-${hostID}`);

  $(dialog.attr('data-caller')).modal('show');
  $('#opfilter').val('')

  dialog
    .removeAttr('data-data')
    .removeAttr('data-caller')
    .removeAttr('data-name')
    .modal('hide');
}

function filterDevlist() {
  // Load device list
  var filter = $('#opfilter').val();
  var listtype = $('#pickDialog').attr('data-type');
  var devlist = $('#devlist');

  var params = {a: "dev", filter: filter};
  $.getJSON('jsm.php', params,
    function (data) {
      var dev, id = 1;
      content = '';

      if (listtype == 'host') {
        content = '<ul class="list-group">';
        for (i in data) {
          content += '<li class="list-group-item"><a href="#" onclick="selectHost(' + i + ',\'' + data[i][2] + '\',\'' + data[i][3] + '\')">' + data[i][1] + '</a><span class="badge badge-secondary float-right">' + data[i][0] + '</span></li>';
        }
        content += '</ul>';
        devlist.html(content);
      } else {
        // content += `<div className="form-group" id="opfilterListGroup" style = "display: none">
        //     <label htmlFor="opfilterList">Filter</label>
        //     <input type="text" className="form-control form-control-sm" id="opfilterList">
        //   </div>`
        for (let i in data) {

          content += `
            <div class="card">
                <div class="card-header" role="tab" id="heading${id}">
                    <a class="mb-0" data-toggle="collapse" href="#collapse${id}" aria-expanded="true" aria-controls="collapse${id}">
                        ${data[i][1]}
                    </a>
                    <span class="badge badge-secondary float-right">
                        ${data[i][0]}
                    </span>
                </div>

                <div id="collapse${id}" class="collapse" role="tabpanel" aria-labelledby="heading${id}" data-parent="#devlist" data-hostid="${i}" data-dataId="${id}">
                  <div className="form-group" id="opfilterListGroup${id}">
                      <label htmlFor="opfilterList${id}">
                          Filter
                      </label>
                      <input type="text" className="form-control form-control-sm" id="opfilterList${id}">
                  </div>
                    <div id="content${id}">
                        Loading...
                    </div>
                </div>
            </div>`;

          id++;
        }


        devlist.html(content);
        $('.collapse').on('show.bs.collapse', (e) => {
          let id = e.target.attributes['data-dataid'].value;
          let hostId = e.target.attributes['data-hostid'].value;
          $(`#opfilterList${id}`).val('');
          $(`#opfilterList${id}`).keyup(() => {
            setTimeout(() => {
              expandTab(hostId, id, $(`#opfilterList${id}`).val())
            }, 500);
          });
          // $(`#opfilterListGroup${id}`).show();
          expandTab(hostId, id, '')
        });
      }
    });
}

function hasLink(n1, n2) {
  for (let obj of mapObj.objects) {
    if (obj.type == 'link')
      if (((obj.nodes[0] == n1) && (obj.nodes[1] == n2)) ||
        ((obj.nodes[0] == n2) && (obj.nodes[1] == n1)))
        return true;
  }

  return false;
}

function contextMenu(e) {
  e.preventDefault();

  var selected = Object.keys(mapObj.selected);
  var sel_count = selected.length;

  var point = [
    e.pageX - offset.left,
    e.pageY - offset.top
  ];

  // If nothing was selected but clicking on an item
  if (sel_count == 0) {
    selectPoint(point[0], point[1], true);

    selected = Object.keys(mapObj.selected);
    sel_count = selected.length;
  }

  if (sel_count > 0) {
    popup.find('.item-add').hide();
    popup.find('.item-clone').show();
    popup.find('.item-edit').show();
    popup.find('.item-delete').show();

    var nodes = [];
    if (sel_count > 1) {
      popup.find('.item-align').show();

      // How many nodes in selected objects?
      for (var i in selected)
        if (mapObj.objects[selected[i]].type == 'node')
          nodes.push(selected[i]);
    }

    if (nodes.length == 2) {
      // Check if nodes are linked
      if (hasLink(mapObj.objects[nodes[0]].id, mapObj.objects[nodes[1]].id)) {
        popup.find('.item-link').show();
        popup.find('.item-unlink').hide();
      } else {
        popup.find('.item-link').show();
        popup.find('.item-unlink').hide();
      }
    } else {
      popup.find('.item-link').hide();
      popup.find('.item-unlink').hide();
    }

    popup.attr('data-idx', selected[0]);
    popup.attr('data-src', 1);
  } else {
    // Or show another menu
    popup.find('.item-add').show();
    popup.find('.item-clone').hide();
    popup.find('.item-align').hide();
    popup.find('.item-link').hide();
    popup.find('.item-unlink').hide();
    popup.find('.item-delete').hide();
    popup.find('.item-edit').hide();
  }

  popup.attr('data-x', point[0]);
  popup.attr('data-y', point[1]);

  popup.css('left', e.pageX).css('top', e.pageY).show();
  popupOpen = true;

  return false;
}

function save() {
  $.post('jsm.php', {a: "save", name: mapObj.name, data: convertData(mapObj)},
    function (data) {
      mapObj.modified = false;
    });
}

function getAttachPointText(side, pos, size, width, height) {
  if (!side) side = 'C';
  if (Array.isArray(side)) {
    var x = pos[0] - width / 2
    var y = pos[1] + height / 2
    var xoffset = Number(side[0])
    var yoffset = Number(side[1])
    return [x + xoffset, y + yoffset];
  }
  switch (side) {
    case 'NW':
      return [pos[0] - size[0] / 2 - width - textPadding, pos[1] - size[1] / 2 - textPadding];

    case 'N':
      return [pos[0] - width / 2, pos[1] - size[1] / 2 - textPadding];

    case 'NE':
      return [pos[0] + size[0] / 2 + textPadding, pos[1] - size[1] / 2 - textPadding];

    case 'W':
      return [pos[0] - size[0] / 2 - width - textPadding, pos[1] + height / 2];

    case 'C':
      return [pos[0] - width / 2, pos[1] + height / 2];

    case 'E':
      return [pos[0] + size[0] / 2 + textPadding, pos[1] + height / 2];

    case 'SW':
      return [pos[0] - size[0] / 2 - width - textPadding, pos[1] + size[1] / 2 + height + textPadding];

    case 'S':
      return [pos[0] - width / 2, pos[1] + size[1] / 2 + height + textPadding];

    case 'SE':
      return [pos[0] + size[0] / 2 + textPadding, pos[1] + size[1] / 2 + height + textPadding];
  }
}

function getAttachPoint(side, pos, size) {
  if (!side) side = 'C';

  if (Array.isArray(side)) {
    var x = pos[0]
    var y = pos[1]
    var xoffset = Number(side[0])
    var yoffset = Number(side[1])
    return [x + xoffset, y + yoffset];
  }

  switch (side) {
    case 'NW':
      return [pos[0] - size[0] / 2, pos[1] - size[1] / 2];

    case 'N':
      return [pos[0], pos[1] - size[1] / 2];

    case 'NE':
      return [pos[0] + size[0] / 2, pos[1] - size[1] / 2];

    case 'W':
      return [pos[0] - size[0] / 2, pos[1]];

    case 'C':
      return [pos[0], pos[1]];

    case 'E':
      return [pos[0] + size[0] / 2, pos[1]];

    case 'SW':
      return [pos[0] - size[0] / 2, pos[1] + size[1] / 2];

    case 'S':
      return [pos[0], pos[1] + size[1] / 2];

    case 'SE':
      return [pos[0] + size[0] / 2, pos[1] + size[1] / 2];
  }
}

function applyTime() {
  objIdx = $('#otIndex').val();

  mapObj.objects[objIdx].fmt = $('#otformat').val();

  mapObj.modified = true;
  $('#editorTime').modal('hide');
  reDraw();
}

function loadData(obj) {
  mapObj = $.extend(true, {}, map_initial, obj);
  linkGlobalId = 0;
  setSize();
  drawBackground();
  compileFonts();
  render();
  linkGlobalId = mapObj.rendered.filter(i => i.type === 'link').length + 2;
  if (loadImages()) reDraw();
  $('#mapname').val(mapObj.name);
}

function initialSetup(profile) {
  $.get('jsm.php?a=get&name=' + profile).done(function (data) {
    var m = importData(data);
    m.name = profile;
    loadData(m);
  }).fail(function (xhr, textStatus, error) {
    $('#message').html(error).show();
    console.error(error);
  });
}

function drawBackground() {
  if (mapObj.config.bgcolor) {
    offContext.fillStyle = mapObj.config.bgcolor;
    offContext.fillRect(0, 0, map_canvas.width, map_canvas.height);
    colors.grid[0] = shadeColor(mapObj.config.bgcolor, -15);
  } else {
    // Clear canvas
    offContext.clearRect(0, 0, map_canvas.width, map_canvas.height);
    colors.grid[0] = colors.grid[1];
  }

  if (mapObj.config.bg) {
    if (imagesCache[mapObj.config.bg] && imagesCache[mapObj.config.bg].complete && imagesCache[mapObj.config.bg].naturalHeight !== 0)
      offContext.drawImage(imagesCache[mapObj.config.bg], 0, 0);
  }

  // Draw grid
  if (grid) {
    offContext.strokeStyle = colors.grid[0];

    offContext.lineWidth = 1;
    offContext.beginPath();

    for (i = 0; i < map_canvas.width; i += grid_step) {
      offContext.moveTo(i, 0);
      offContext.lineTo(i, map_canvas.height);

      for (j = 0; j < map_canvas.height; j += grid_step) {
        offContext.moveTo(0, j);
        offContext.lineTo(map_canvas.width, j);
      }
    }

    offContext.stroke();
  }

  offImage = offContext.getImageData(0, 0, map_canvas.width, map_canvas.height);
}

function dualDashline(ctx, x0, y0, x1, y1) {
  ctx.shadowColor = 'white';
  ctx.shadowBlur = 2;
  ctx.strokeStyle = 'black';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.stroke();
  ctx.stroke();
}

function reDraw() {
  var i, j, via, onecurved, obj,
    objSize, coord1, oNode1, oNode2,
    coord2, pos, hasImage;

  dContext.clearRect(0, 0, map_canvas.width, map_canvas.height);

  // Draw links
  for (var i in mapObj.rendered) {
    var obj = mapObj.rendered[i];
    if (obj.type != 'link') continue;

    oNode1 = mapObj.rendered[obj.nodesID[0]];
    oNode2 = mapObj.rendered[obj.nodesID[1]];

    objSize = (imagesCache[oNode1.img]) ? [imagesCache[oNode1.img].width, imagesCache[oNode1.img].height] : nodeSize;

    coord1 = mapObj.objects[obj.nodesID[0]].pos;
    coord1 = getAttachPoint((obj.attach) ? obj.attach[0] : 'C', coord1, objSize);

    objSize = (imagesCache[oNode2.img]) ? [imagesCache[oNode2.img].width, imagesCache[oNode2.img].height] : nodeSize;

    coord2 = mapObj.objects[obj.nodesID[1]].pos;
    coord2 = getAttachPoint((obj.attach) ? obj.attach[1] : 'C', coord2, objSize);

    via = 2;

    if (obj.via != null) via = obj.via;

    // Via
    if (obj.pos) {
      pos = mapObj.objects[i].pos;
      // curved 1 via - draw dotted helper
      onecurved = (pos.length == 1) && (via == 2);

      if (onecurved) {
        dContext.strokeStyle = colors.via[0];
        dContext.lineWidth = 1.5;
        dContext.setLineDash([5, 3]);
        dualDashline(dContext, coord1[0], coord1[1], pos[0][0], pos[0][1])
        dualDashline(dContext, pos[0][0], pos[0][1], coord2[0], coord2[1])
      } else {
        dContext.lineWidth = (obj.width) ? obj.width : 7;
        dContext.strokeStyle = colors.link;
        dContext.setLineDash([]);

        dContext.beginPath();
        dContext.moveTo(coord1[0], coord1[1]);
        for (i in pos)
          dContext.lineTo(pos[i][0], pos[i][1]);
        dContext.lineTo(coord2[0], coord2[1]);
        dContext.stroke();
      }


      if (onecurved) {
        dContext.lineWidth = (obj.width) ? obj.width : 7;
        dContext.strokeStyle = colors.link;
        dContext.setLineDash([]);

        dContext.beginPath();
        dContext.moveTo(coord1[0], coord1[1]);
        dContext.quadraticCurveTo(
          pos[0][0], pos[0][1],
          coord2[0], coord2[1]);
        dContext.stroke();
      }

      dContext.fillStyle = colors.via[1];

      for (i in pos)
        dContext.fillRect(pos[i][0] - viaSize[0] / 2, pos[i][1] - viaSize[1] / 2, viaSize[0], viaSize[1]);
    } else {
      dContext.lineWidth = (obj.width) ? obj.width : 7;
      dContext.strokeStyle = colors.link;

      dContext.beginPath();
      dContext.moveTo(coord1[0], coord1[1]);
      dContext.lineTo(coord2[0], coord2[1]);
      dContext.stroke();
    }
  }

  dContext.lineWidth = 1;

  // Draw nodes
  for (i in mapObj.rendered) {
    obj = mapObj.rendered[i];
    if (!obj.pos) continue;
    pos = mapObj.objects[i].pos;

    switch (obj.type) {
      case "node":
        hasImage = false;

        if (obj.img && imagesCache[obj.img] && imagesCache[obj.img].complete && imagesCache[obj.img].naturalHeight !== 0) {
          if (obj.hasOwnProperty('imgSize')) {
            // keep the ratio for the images
            const ratio = (imagesCache[obj.img].width || 0) / ((imagesCache[obj.img].height === 0 ? 1 : imagesCache[obj.img].height) || 1)
            const h = Number(obj.imgSize.w) / ((ratio === 0 ? 1 : ratio) || 1)
            objSize = [obj.imgSize.w, h]
          } else {
            objSize = [imagesCache[obj.img].width, imagesCache[obj.img].height];
          }
          hasImage = true;
        } else
          objSize = nodeSize;

        dContext.strokeStyle = (mapObj.selected[i]) ? colors.selected : colors.stroke;

        // Node icon
        if (hasImage) {
          const img = imagesCache[obj.img]
          const positionW = pos[0] - objSize[0] / 2
          const positionH = pos[1] - objSize[1] / 2
          dContext.drawImage(img, positionW, positionH, objSize[0], objSize[1]);
          // dContext.drawImage(imagesCache[obj.img], pos[0] - objSize[0] / 2, pos[1] - objSize[1] / 2);

          if (mapObj.selected[i]) {
            dContext.strokeWidth = 1;
            dContext.strokeRect(pos[0] - objSize[0] / 2, pos[1] - objSize[1] / 2, objSize[0], objSize[1]);
          }
        } else {
          dContext.strokeWidth = 1;
          dContext.strokeRect(pos[0] - objSize[0] / 2, pos[1] - objSize[1] / 2, objSize[0], objSize[1]);
        }

        dContext.font = mapObj.fontsR[(obj.font) ? obj.font : defFont.node];

        // Cache text width to speedup
        if (!obj.textWidth)
          obj.textWidth = dContext.measureText(obj.title).width;

        coord1 = getAttachPointText((obj.loffset) ? obj.loffset : 'C', pos, objSize, obj.textWidth, textHeight);

        // Box surrounding text
        coord2 = [coord1[0] - textPadding, coord1[1] - textHeight - textPadding];

        // Text box
        dContext.strokeWidth = 1;
        if (obj.lbg) {
          if (obj.lbg != 'none') {
            dContext.fillStyle = obj.lbg;
            dContext.fillRect(coord2[0], coord2[1], obj.textWidth + 2 * textPadding, textHeight + 2 * textPadding);
          }
        } else {
          dContext.fillStyle = '#FFFFFF';
          dContext.fillRect(coord2[0], coord2[1], obj.textWidth + 2 * textPadding, textHeight + 2 * textPadding);
        }

        if (obj.outcolor) {
          if (obj.outcolor != 'none') {
            dContext.strokeStyle = obj.outcolor;
            dContext.strokeRect(coord2[0], coord2[1], obj.textWidth + 2 * textPadding, textHeight + 2 * textPadding);
          }
        } else {
          dContext.strokeStyle = colors.textout;
          dContext.strokeRect(coord2[0], coord2[1], obj.textWidth + 2 * textPadding, textHeight + 2 * textPadding);
        }

        // Text
        dContext.fillStyle = (obj.color) ? obj.color : colors.text;

        dContext.fillText(obj.title, coord1[0], coord1[1] - 2);
        break;

      case "scale":
        objSize = scaleSize;

        objSize[1] = 38 + scaleBlock[1] * mapObj.scales[obj.id].length;

        dContext.strokeStyle = (mapObj.selected[i]) ? colors.selected : (mapObj.config.keyoutcolor) ? mapObj.config.keyoutcolor : colors.stroke;
        dContext.strokeRect(pos[0], pos[1], objSize[0], objSize[1]);

        if (mapObj.config.keybgcolor) {
          dContext.fillStyle = mapObj.config.keybgcolor;
          dContext.fillRect(pos[0], pos[1], objSize[0], objSize[1]);
        }

        dContext.font = mapObj.fontsR[(mapObj.config.keyfont) ? mapObj.config.keyfont : defFont.scale];

        dContext.fillStyle = (mapObj.config.keycolor) ? mapObj.config.keycolor : "#000000";
        dContext.fillText(obj.title, pos[0] + textPadding, pos[1] + 15);

        // Colored bars
        var j = 0;
        for (let scale of mapObj.scales[obj.id]) {
          if (obj.hidezero && (scale.min == 0) && (scale.max == 0)) continue; // Skip empty

          dContext.fillStyle = scale.color;
          dContext.fillRect(
            pos[0] + 5,
            pos[1] + 24 + (scaleBlock[1] + scalePadding) * j,
            scaleBlock[0], scaleBlock[1]);

          dContext.fillStyle = colors.text;
          dContext.fillText(scale.min + '-' + scale.max + ((obj.hideperc) ? '' : '%'),
            pos[0] + scaleBlock[0] + 4 * textPadding,
            pos[1] + 28 + scaleBlock[1] / 2 + (scaleBlock[1] + scalePadding) * j);
          j++;
        }
        break;

      case "time":
        dContext.font = mapObj.fontsR[(mapObj.config.timefont) ? mapObj.config.timefont : defFont.time];

        dContext.fillStyle = (mapObj.config.timecolor) ? mapObj.config.timecolor : "#000000";
        dContext.fillText(obj.fmt, pos[0], pos[1] - 2);
        break;

      case "title":
        dContext.font = mapObj.fontsR[(mapObj.config.titlefont) ? mapObj.config.titlefont : defFont.title];

        dContext.fillStyle = (mapObj.config.titlecolor) ? mapObj.config.titlecolor : "#000000";
        dContext.fillText(mapObj.config.title, pos[0], pos[1] - 2);
        break;
    }
  }

  // for (let a in genericDrawContainer) {
  //   var fn = genericDrawContainer[a]['fn'];
  //   var args = genericDrawContainer[a]['args'];
  //   var dFunction = dContext[fn];
  //   dFunction(...args);
  // }
}

function compileFonts() {
  mapObj.fontsR = {};

  mapObj.fontsR = $.extend(true, mapObj.fontsR, fixedFonts);

  // Only fixed font faces are supported
  for (let font of mapObj.fonts) {
    mapObj.fontsR[parseInt(font.id)] = fixedFonts[4].face;
  }
}

function showOptions() {
  $('#opcacti').val(cacti_webpath);
  $('#oprra').val(rra_path);
  $('#opimgs').val(imagesUrl);

  $('#opgrid').prop('checked', grid);
  $('#opgsnap').prop('checked', grid_snap);
  $('#opgstep').val(grid_step);

  $('#optionsDialog').modal('show');
}

function applyOptions() {
  cacti_webpath = $('#opcacti').val();
  rra_path = $('#oprra').val();
  imagesUrl = $('#opimgs').val();

  grid = $('#opgrid').prop('checked');
  grid_snap = $('#opgsnap').prop('checked');
  grid_step = parseInt($('#opgstep').val());

  localStorage.cacti = cacti_webpath;
  localStorage.rra = rra_path;
  localStorage.imgurl = imagesUrl;

  localStorage.grid = grid ? 1 : 0;
  localStorage.gsnap = grid_snap ? 1 : 0;
  localStorage.gstep = grid_step;

  // Reset image cache
  remainImages = 0;
  imagesCache = {};

  drawBackground();
  if (loadImages()) reDraw();

  $('#optionsDialog').modal('hide');
}

function deColor(color) {
  if (color == 'none') return 'none';

  return parseInt(color.substring(1, 3), 16) + ' ' +
    parseInt(color.substring(3, 5), 16) + ' ' +
    parseInt(color.substring(5, 7), 16);
}

/*
 * Encodes RGB to hex
 * First arg must be as is to handle 'none'
 */
function enColor(r, g, b) {
  if (r == 'none') return r;

  var result = '#';

  r = parseInt(r);

  if (r < 16)
    result += '0';

  result += r.toString(16);

  if (g < 16)
    result += '0';

  result += g.toString(16);

  if (b < 16)
    result += '0';

  result += b.toString(16);

  return result
}

/*
 * Import / export
 */
function getNodesText(data) {
  var result = '';

  for (let obj of data) {
    result += "NODE " + obj.id + "\n";

    if (obj.template)
      result += "\tTEMPLATE " + obj.template + "\n";

    if (obj.img)
      result += "\tICON " + obj.img + "\n";

    if (obj.title)
      result += "\tLABEL " + obj.title + "\n";

    if (obj.pos)
      result += "\tPOSITION " + obj.pos[0] + " " + obj.pos[1] + "\n";

    if (obj.data)
      result += "\tTARGET " + obj.data + "\n";

    if (obj.loffset) {
      if (Array.isArray(obj.loffset)) {
        result += "\tLABELOFFSET " + obj.loffset[0] + " " + obj.loffset[1] + "\n";
      } else {
        result += "\tLABELOFFSET " + obj.loffset + "\n";
      }
    }

    if (obj.langle)
      result += "\tLABELANGLE " + obj.langle + "\n";

    if (obj.color)
      result += "\tLABELFONTCOLOR " + deColor(obj.color) + "\n";

    if (obj.lbg)
      result += "\tLABELBGCOLOR " + deColor(obj.lbg) + "\n";

    if (obj.outcolor)
      result += "\tLABELOUTLINECOLOR " + deColor(obj.outcolor) + "\n";

    if (obj.font)
      result += "\tLABELFONT " + obj.font + "\n";

    if (obj.info)
      result += "\tINFOURL " + obj.info + "\n";

    if (obj.hover)
      result += "\tOVERLIBGRAPH " + obj.hover + "\n";

    if (obj.cacti)
      result += "\tSET cacti_id " + obj.cacti + "\n";

    if (obj.max)
      result += "\tMAXVALUE " + obj.max + "\n";

    if (obj.overcap)
      result += "\tOVERLIBCAPTION " + obj.overcap + "\n";

    if (obj.overwidth)
      result += "\tOVERLIBWIDTH " + obj.overwidth + "\n";

    if (obj.overheight)
      result += "\tOVERLIBHEIGHT " + obj.overheight + "\n";

    if (obj.scale)
      result += "\tUSESCALE " + obj.scale[0] + " in " + obj.scale[1] + "\n";

    if (obj.ext)
      result += obj.ext + "\n";

    result += "\n";
  }

  return result;
}

function getLinksText(data) {
  var result = '';

  for (let obj of data) {
    if (obj.id)
      result += "LINK " + obj.id + "\n";
    else
      result += "LINK " + obj.nodes[0] + "-" + obj.nodes[1] + "\n";

    if (obj.template)
      result += "\tTEMPLATE " + obj.template + "\n";

    if (obj.width)
      result += "\tWIDTH " + obj.width + "\n";

    if (obj.speed)
      result += "\tBANDWIDTH " + obj.speed + "\n";

    if (obj.data)
      result += "\tTARGET " + obj.data + "\n";

    if (obj.info)
      result += "\tINFOURL " + obj.info + "\n";

    if (obj.hover)
      result += "\tOVERLIBGRAPH " + obj.hover + "\n";

    if (obj.pos) {
      for (let via of obj.pos)
        result += "\tVIA " + via[0] + " " + via[1] + "\n";
    }

    if (obj.nodes) {
      result += "\tNODES ";

      if (obj.attach) {
        if (Array.isArray(obj.attach[0])) {
          result += obj.nodes[0] + ":" + ((obj.attach[0]) ? obj.attach[0].join(':') : 'C') + " ";
        } else {
          result += obj.nodes[0] + ":" + ((obj.attach[0]) ? obj.attach[0] : 'C') + " ";
        }
        if (Array.isArray(obj.attach[1])) {
          result += obj.nodes[1] + ":" + ((obj.attach[1]) ? obj.attach[1].join(':') : 'C') + "\n";
        } else {
          result += obj.nodes[1] + ":" + ((obj.attach[1]) ? obj.attach[1] : 'C') + "\n";
        }
      } else
        result += obj.nodes[0] + " " + obj.nodes[1] + "\n";
    }

    if (obj.duplex)
      result += "\tDUPLEX " + ['half', 'full'][obj.duplex - 1] + "\n";

    if (obj.arrow)
      result += "\tARROWSTYLE " + obj.arrow + "\n";

    if (obj.link)
      result += "\tLINKSTYLE " + ['oneway', 'twoway'][obj.link - 1] + "\n";

    if (obj.bwlabel)
      result += "\tBWFONTCOLOR " + deColor(obj.bwlabel) + "\n";

    if (obj.outcolor)
      result += "\tOUTLINECOLOR " + deColor(obj.outcolor) + "\n";

    if (obj.bwoutcolor)
      result += "\tBWOUTLINECOLOR " + deColor(obj.bwoutcolor) + "\n";

    if (obj.bwboxcolor)
      result += "\tBWBOXCOLOR " + deColor(obj.bwboxcolor) + "\n";

    if (obj.bwfont)
      result += "\tBWFONT " + obj.bwfont + "\n";

    if (obj.scale) {
      result += "\tUSESCALE " + obj.scale;

      if (obj.scalet)
        result += ['absolute', 'percent'][obj.scalet];

      result += "\n";
    }

    if (obj.via)
      result += "\tVIASTYLE " + ['angled', 'curved'][obj.via - 1] + "\n";

    if (obj.notes)
      result += "\tNOTES " + obj.notes + "\n";

    if (obj.comment)
      result += "\tOUTCOMMENT " + obj.comment + "\n";

    if (obj.ext)
      result += obj.ext + "\n";

    result += "\n";
  }

  return result;
}

function getScales(data) {
  var result = '';

  if (mapObj.config.keyfont)
    result += "KEYFONT " + mapObj.config.keyfont + "\n";

  if (mapObj.config.keycolor)
    result += "KEYTEXTCOLOR " + deColor(mapObj.config.keycolor) + "\n";

  if (mapObj.config.keyoutcolor)
    result += "KEYOUTLINECOLOR " + deColor(mapObj.config.keyoutcolor) + "\n";

  if (mapObj.config.keybgcolor)
    result += "KEYBGCOLOR " + deColor(mapObj.config.keybgcolor) + "\n";

  scales = data.objects.filter(function (obj) {
    return obj.type == 'scale'
  });

  for (let scale of scales) {
    if (scale.pos)
      result += "KEYPOS " + scale.id + " " + scale.pos[0] + " " + scale.pos[1] + " " + scale.title + "\n";

    if (scale.hidezero)
      result += "SET key_hidezero_" + scale.id + " 1\n";

    if (scale.hideperc)
      result += "SET key_hidepercent_" + scale.id + " 1\n";
  }

  for (i in data.scales) {
    for (let scale of data.scales[i])
      result += "SCALE " + i + " " + scale.min + " " + scale.max + " " + deColor(scale.color) + "\n";

    result += "\n";
  }

  return result;
}

function getFonts(data) {
  var result = '';

  for (let font of data)
    result += "FONTDEFINE " + font.id + " " + font.face + "\n";

  return result;
}

function getTimesText(data) {
  var result = '';

  if (mapObj.config.timefont)
    result += "TIMEFONT " + mapObj.config.timefont + "\n";

  if (mapObj.config.timecolor)
    result += "TIMECOLOR " + deColor(mapObj.config.timecolor) + "\n";

  for (let time of data)
    result += ["", "MIN", "MAX"][time.sub] + "TIMEPOS " + time.pos[0] + " " + time.pos[1] + " " + time.fmt + "\n";

  return result;
}

function getTitleText(data) {
  var result = '';

  if (mapObj.config.titlefont)
    result += "TITLEFONT " + mapObj.config.titlefont + "\n";

  if (mapObj.config.title)
    result += "TITLE " + mapObj.config.title + "\n";

  for (let title of data)
    result += "TITLEPOS " + title.pos[0] + " " + title.pos[1] + "\n";

  return result;
}

function convertData(source) {
  var wthmap = '';

  wthmap += "# Generated by WMap Creator (13hakta)\n\n";

  if (source.config.ext)
    wthmap += source.config.ext + "\n";

  wthmap += "WIDTH " + source.config.size[0] + "\n";
  wthmap += "HEIGHT " + source.config.size[1] + "\n";

  if (source.config.bg)
    wthmap += "BACKGROUND " + source.config.bg + "\n";

  if (source.config.bgcolor)
    wthmap += "BGCOLOR " + deColor(source.config.bgcolor) + "\n";

  if (source.config.style)
    wthmap += "HTMLSTYLE " + source.config.style + "\n";

  if (source.config.css)
    wthmap += "HTMLSTYLESHEET " + source.config.css + "\n";

  if (source.config.outhtml)
    wthmap += "HTMLOUTPUTFILE " + source.config.outhtml + "\n";

  if (source.config.outimage)
    wthmap += "IMAGEOUTPUTFILE " + source.config.outimage + "\n";

  wthmap += getTitleText(source.objects.filter(function (obj) {
    return obj.type == 'title'
  }));

  wthmap += getFonts(source.fonts);

  // Time
  wthmap += getTimesText(source.objects.filter(function (obj) {
    return obj.type == 'time'
  }));

  // Scales
  wthmap += getScales(source);

  wthmap += "\n# template NODEs:\n";
  wthmap += getNodesText(source.templates.filter(function (obj) {
    return obj.type == 'node'
  }));

  wthmap += "\n# template LINKs:\n";
  wthmap += getLinksText(source.templates.filter(function (obj) {
    return obj.type == 'link'
  }));

  wthmap += "# end of global\n";

  wthmap += "\n# regular NODEs:\n";
  wthmap += getNodesText(source.objects.filter(function (obj) {
    return obj.type == 'node'
  }));

  wthmap += "\n# regular LINKs:\n";
  wthmap += getLinksText(source.objects.filter(function (obj) {
    return obj.type == 'link'
  }));

  return wthmap;
}

function importData(data) {
  if (data == '') {
    alert('Empty source');
    return;
  }

  var newMap = {};

  newMap.config = {ext: "", size: [800, 600]};
  newMap.objects = [];
  newMap.templates = [];
  newMap.scales = {};
  newMap.fonts = [];

  var isGlobal = true, isLink = false, isNode = false, args, param, node, link;

  var dataArr = data.split("\n");
  for (let line of dataArr) {
    line = line.trim();

    // Ignore empty and commented lines
    if ((line == '') || (line.substr(0, 1) == '#')) continue;

    args = line.split(/\s+/);
    param = args.shift();

    if (param == 'NODE') {
      if (isNode) {
        if (node.pos)
          newMap.objects.push(node);
        else
          newMap.templates.push(node);
      }

      if (isLink) {
        if (link.nodes)
          newMap.objects.push(link);
        else
          newMap.templates.push(link);
      }

      isGlobal = false;
      isLink = false;
      isNode = true;

      // get ID
      node = {type: "node", id: args.shift(), ext: ""};

      continue;
    }

    if (param == 'LINK') {
      if (isNode) {
        if (node.pos)
          newMap.objects.push(node);
        else
          newMap.templates.push(node);
      }

      if (isLink) {
        if (link.nodes)
          newMap.objects.push(link);
        else
          newMap.templates.push(link);
      }

      isGlobal = false;
      isNode = false;
      isLink = true;

      // get ID
      link = {type: "link", id: args.shift(), ext: ""};

      continue;
    }

    if (isNode) {
      switch (param) {
        case "ICON":
          if (args.length === 3) {
            node.imgSize = {w: args[0], h: args[1]}
            node.img = args[2];
          } else {
            node.img = args.shift();
          }
          break;

        case "POSITION":
          node.pos = [parseInt(args.shift()), parseInt(args.shift())];
          break;

        case "TEMPLATE":
          node.template = args.shift();
          break;

        case "LABEL":
          node.title = args.join(' ');
          break;

        case "LABELFONT":
          node.font = parseInt(args.shift());
          break;

        case "TARGET":
          node.data = args.shift();
          break;

        case "INFOURL":
          node.info = args.shift();
          break;

        case "OVERLIBGRAPH":
          node.hover = args.shift();
          break;

        case "MAXVALUE":
          node.max = parseInt(args.shift());
          break;

        case "OVERLIBCAPTION":
          node.overcap = args.shift();
          break;

        case "OVERLIBWIDTH":
          node.overwidth = parseInt(args.shift());
          break;

        case "OVERLIBHEIGHT":
          node.overheight = parseInt(args.shift());
          break;

        case "LABELOFFSET":
          if (args.length > 0) {
            var compassPoints = ['C', 'NE', 'SE', 'NW', 'SW', 'N', 'S', 'E', 'W']
            if (compassPoints.includes(args[0])) {
              node.loffset = args.shift();
            } else {
              node.loffset = args;
            }
          } else {
            node.loffset = args.shift();
          }
          break;

        case "LABELANGLE":
          node.langle = parseInt(args.shift());
          break;

        case "LABELFONTCOLOR":
          node.color = enColor(
            args.shift(),
            parseInt(args.shift()),
            parseInt(args.shift()));
          break;

        case "LABELOUTLINECOLOR":
          node.outcolor = enColor(
            args.shift(),
            parseInt(args.shift()),
            parseInt(args.shift()));
          break;

        case "LABELBGCOLOR":
          node.lbg = enColor(
            args.shift(),
            parseInt(args.shift()),
            parseInt(args.shift()));
          break;

        case "USESCALE":
          node.scale = [args.shift()];
          args.shift(); // skip 'in'
          node.scale.push(args.shift());
          break;

        case "SET":
          var key = args.shift();
          if (key == 'cacti_id')
            node.cacti = parseInt(args.shift());
          else
            node.ext += line + "\n";
          break;

        default:
          node.ext += line + "\n";
      }
    }

    if (isLink) {
      switch (param) {
        case "VIA":
          if (link.pos)
            link.pos.push([parseInt(args.shift()), parseInt(args.shift())]);
          else
            link.pos = [[parseInt(args.shift()), parseInt(args.shift())]];
          break;

        case "VIASTYLE":
          var style = args.shift();
          switch (style) {
            case "angled":
              link.via = 1;
              break;

            case "curved":
              link.via = 2;
              break;
          }
          break;

        case "TEMPLATE":
          link.template = args.shift();
          break;

        case "TARGET":
          link.data = args.shift();
          break;

        case "INFOURL":
          link.info = args.shift();
          break;

        case "OVERLIBGRAPH":
          link.hover = args.shift();
          break;

        case "OVERLIBCAPTION":
          link.overcap = args.shift();
          break;

        case "OVERLIBWIDTH":
          link.overwidth = parseInt(args.shift());
          break;

        case "OVERLIBHEIGHT":
          link.overheight = parseInt(args.shift());
          break;

        case "WIDTH":
          link.width = parseInt(args.shift());
          break;

        case "BANDWIDTH":
          link.speed = args.join(' ');
          break;

        case "NODES":
          var node1 = args.shift();
          var node2 = args.shift();

          var node1A = node1.split(':');
          var node2A = node2.split(':');

          link.nodes = [node1A.shift(), node2A.shift()];

          if (node1A[0] || node2A[0])
            link.attach = [node1A.length > 1 ? node1A : node1A[0], node2A.length > 1 ? node2A : node2A[0]];
          break;

        default:
          link.ext += line + "\n";
      }
    }

    if (isGlobal) {
      switch (param) {
        case "WIDTH":
          newMap.config.size[0] = parseInt(args.shift());
          break;

        case "HEIGHT":
          newMap.config.size[1] = parseInt(args.shift());
          break;

        case "TITLE":
          newMap.config.title = args.join(' ');
          break;

        case "HTMLSTYLE":
          newMap.config.style = args.shift();
          break;

        case "HTMLSTYLESHEET":
          newMap.config.css = args.shift();
          break;

        case "KEYFONT":
          newMap.config.keyfont = parseInt(args.shift());
          break;

        case "TITLEFONT":
          newMap.config.titlefont = parseInt(args.shift());
          break;

        case "TIMEFONT":
          newMap.config.timefont = parseInt(args.shift());
          break;

        case "KEYTEXTCOLOR":
          newMap.config.keycolor = enColor(
            args.shift(),
            parseInt(args.shift()),
            parseInt(args.shift()));
          break;

        case "KEYOUTLINECOLOR":
          newMap.config.keyoutcolor = enColor(
            args.shift(),
            parseInt(args.shift()),
            parseInt(args.shift()));
          break;

        case "KEYBGCOLOR":
          newMap.config.keybgcolor = enColor(
            args.shift(),
            parseInt(args.shift()),
            parseInt(args.shift()));
          break;

        case "BACKGROUND":
          newMap.config.bg = args.shift();
          break;

        case "BGCOLOR":
          newMap.config.bgcolor = enColor(
            args.shift(),
            parseInt(args.shift()),
            parseInt(args.shift()));
          break;

        case "TITLECOLOR":
          newMap.config.titlecolor = enColor(
            args.shift(),
            parseInt(args.shift()),
            parseInt(args.shift()));
          break;

        case "TIMECOLOR":
          newMap.config.timecolor = enColor(
            args.shift(),
            parseInt(args.shift()),
            parseInt(args.shift()));
          break;

        case "IMAGEOUTPUTFILE":
          newMap.config.outimage = args.shift();
          break;

        case "HTMLOUTPUTFILE":
          newMap.config.outhtml = args.shift();
          break;

        case "FONTDEFINE":
          newMap.fonts.push({
            id: parseInt(args.shift()),
            face: args.join(' ')
          });
          break;

        case "TIMEPOS":
          newMap.objects.push({
            type: 'time',
            pos: [parseInt(args.shift()), parseInt(args.shift())],
            sub: 0,
            fmt: args.join(' ')
          });
          break;

        case "MINTIMEPOS":
          newMap.objects.push({
            type: 'time',
            pos: [parseInt(args.shift()), parseInt(args.shift())],
            sub: 1,
            fmt: args.join(' ')
          });
          break;

        case "MAXTIMEPOS":
          newMap.objects.push({
            type: 'time',
            pos: [parseInt(args.shift()), parseInt(args.shift())],
            sub: 2,
            fmt: args.join(' ')
          });
          break;

        case "TITLEPOS":
          newMap.objects.push({
            type: 'title',
            pos: [parseInt(args.shift()), parseInt(args.shift())]
          });
          break;

        case "KEYPOS":
          var id = (args.length == 2) ? 'DEFAULT' : args.shift();
          if (!newMap.scales[id]) newMap.scales[id] = [];

          newMap.objects.push({
            type: 'scale',
            id: id,
            pos: [parseInt(args.shift()), parseInt(args.shift())],
            title: args.join(' ')
          });
          break;

        case "SCALE":
          var id = args.shift();
          if (!newMap.scales[id]) newMap.scales[id] = [];

          newMap.scales[id].push({
            min: parseFloat(args.shift()),
            max: parseFloat(args.shift()),
            color: enColor(
              parseInt(args.shift()),
              parseInt(args.shift()),
              parseInt(args.shift()))
          });
          break;

        case "SET":
          // Handle SCALE keys
          var id = args.shift();
          if (id.substr(0, 8) == 'key_hide') {
            var clues = id.split('_');
            if (clues[1] == 'hidezero') {
              id = getNodeById(newMap.objects, clues[2], 'scale');
              if (id != null)
                newMap.objects[id].hidezero = 1;
              else
                console.warn('Scale SET for ' + clues[2] + ' cannot bind');
            }

            if (clues[1] == 'hidepercent') {
              id = getNodeById(newMap.objects, clues[2], 'scale');
              if (id != null)
                newMap.objects[id].hideperc = 1;
              else
                console.warn('Scale SET for ' + clues[2] + ' cannot bind');
            }
          } else
            newMap.config.ext += line + "\n";
          break;

        default:
          newMap.config.ext += line + "\n";
      }
    }
  }

  if (isNode) {
    if (node.pos)
      newMap.objects.push(node);
    else
      newMap.templates.push(node);
  }

  if (isLink) {
    if (link.nodes)
      newMap.objects.push(link);
    else
      newMap.templates.push(link);
  }

  cleanup(newMap);
  return newMap;
}

function loadSession() {
  if (!localStorage.getItem('cacti')) {
    cacti_webpath = cacti_webpath_default;
    rra_path = rra_path_default;
    imagesUrl = imagesUrl_default;

    grid = grid_default;
    grid_snap = grid_snap_default;
    grid_step = grid_step_default;

    localStorage.cacti = cacti_webpath;
    localStorage.rra = rra_path;
    localStorage.imgurl = imagesUrl;

    localStorage.grid = grid ? 1 : 0;
    localStorage.gsnap = grid_snap ? 1 : 0;
    localStorage.gstep = grid_step;
  } else {
    cacti_webpath = localStorage.getItem('cacti');
    rra_path = localStorage.getItem('rra');
    imagesUrl = localStorage.getItem('imgurl');

    grid = localStorage.getItem('grid') == 1;
    grid_snap = localStorage.getItem('gsnap') == 1;
    grid_step = parseInt(localStorage.getItem('gstep'));
  }
}

function importMap() {
  var m = importData($('#mapinput').val());
  m.name = 'import' + Math.floor(Math.random() * 100000);
  loadData(m);

  $('#importDialog').modal('hide');
}

function shadeColor(color, percent) {
  color = color.slice(1);
  var num = parseInt(color, 16);

  var r = (num >> 16) + percent;

  if (r > 255) r = 255;
  else if (r < 0) r = 0;

  var b = ((num >> 8) & 0x00FF) + percent;

  if (b > 255) b = 255;
  else if (b < 0) b = 0;

  var g = (num & 0x0000FF) + percent;

  if (g > 255) g = 255;
  else if (g < 0) g = 0;

  return "#" + (g | (b << 8) | (r << 16)).toString(16);
}

function mapTemplates() {
  var i, content = '', content2 = '';

  for (i in mapObj.templates) {
    tpl = mapObj.templates[i];

    if (tpl.type == 'node') {
      content += '<li class="list-group-item" data-idx="' + i + '">' + tpl.id +
        '<div class="btn-group btn-group-sm float-right" role="group">' +
        '<button type="button" class="btn btn-secondary">Edit</button>' +
        '<button type="button" class="btn btn-danger">Delete</button></div></li>';
      continue;
    }

    if (tpl.type == 'link') {
      content2 += '<li class="list-group-item" data-idx="' + i + '">' + tpl.id +
        '<div class="btn-group btn-group-sm float-right" role="group">' +
        '<button type="button" class="btn btn-secondary">Edit</button>' +
        '<button type="button" class="btn btn-danger">Delete</button></div></li>';
    }
  }

  $('#tplNodes')
    .html(content)
    .find('.btn-secondary').click(function () {
    var idx = $(this).parent().parent().attr('data-idx');

    popup
      .attr('data-idx', idx)
      .attr('data-src', 0);

    $('#templateDialog').modal('hide');
    menuEdit();
  });

  $('#tplLinks').html(content2)
    .find('.btn-secondary').click(function () {
    var idx = $(this).parent().parent().attr('data-idx');

    $('#olIndex').val(idx);
    popup.attr('data-src', 0);

    $('#templateDialog').modal('hide');
    editLink();
  });

  $('#templateDialog')
    .find('.btn-danger').click(function () {
    if (confirm('Are you sure to delete?')) {
      var idx = item.attr('data-idx');

      mapObj.templates.splice(idx, 1);

      cleanup(mapObj);
      render();
      reDraw();

      mapTemplates();
    }
  });

  $('#templateDialog').modal('show');
}

function addTemplate() {
  var idx, tab = $('#tabt a.active').attr('id');

  if (tab == 'tabtn') {
    idx = mapObj.templates.push({type: 'node', id: 'TN' + Math.floor(Math.random() * 1000)}) - 1;

    popup
      .attr('data-idx', idx)
      .attr('data-src', 0);

    $('#templateDialog').modal('hide');
    menuEdit();
  } else {
    idx = mapObj.templates.push({type: 'link', id: 'TL' + Math.floor(Math.random() * 1000)}) - 1;

    $('#olIndex').val(idx);
    popup.attr('data-src', 0);

    $('#templateDialog').modal('hide');
    editLink();
  }
}

function pickData(type) {
  if (type == 'node') {
    $('#pickDialog')
      .attr('data-caller', '#editorNode')
      .attr('data-type', 'node')
      .attr('data-data', '#oddata')
      .attr('data-info', '#odinfo')
      .attr('data-hover', '#odhover');
    $('#editorNode').modal('hide');
  }

  if (type == 'link') {
    $('#pickDialog')
      .attr('data-caller', '#editorLink')
      .attr('data-type', 'link')
      .attr('data-data', '#oldata')
      .attr('data-info', '#olinfo')
      .attr('data-hover', '#olhover');
    $('#editorLink').modal('hide');
  }

  if (type == 'cacti') {
    $('#pickDialog')
      .attr('data-caller', '#editorNode')
      .attr('data-type', 'host')
      .attr('data-data', '#odcacti')
      .attr('data-info', '#odinfo')
      .attr('data-hover', '#odhover')
      .attr('data-name', '#odname');
    $('#opfilter').val($('#odcacti').val());

    $('#editorNode').modal('hide');
  }

  $('#pickDialog').modal('show');
}

function mapScales() {
  var i, obj, content = '';

  for (i in mapObj.objects) {
    obj = mapObj.objects[i];
    if (obj.type == 'scale') {
      content += '<li class="list-group-item" data-idx="' + i + '">' + obj.id +
        '<div class="btn-group btn-group-sm float-right" role="group">' +
        '<button type="button" class="btn btn-secondary">Edit</button>' +
        '<button type="button" class="btn btn-danger">Delete</button></div></li>';
    }
  }

  var scalelist = $('#scalelist');
  scalelist.html(content).find('.btn-secondary').click(function () {
    var idx = $(this).parent().parent().attr('data-idx');

    $('#scaleDialog').modal('hide');
    editScale(idx);
  });

  scalelist.find('.btn-danger').click(function () {
    if (!confirm('Are you sure to delete?')) return;

    var idx = $(this).parent().parent().attr('data-idx');

    mapObj.objects.splice(idx, 1);

    render();
    reDraw();

    mapScales();
  });

  $('#scaleDialog').modal('show');
}

function addScale() {
  var idx = mapObj.objects.push({type: 'scale', id: 'TN' + Math.floor(Math.random() * 1000)}) - 1;

  $('#scaleDialog').modal('hide');
  editScale(idx);
}

function editScale(idx) {
  $('#osIndex').val(idx);

  var obj = mapObj.objects[idx];

  $('#osid').val(obj.id);
  $('#ostitle').val(obj.title);
  $('#osshow').prop('checked', obj.pos);
  $('#oshidezero').prop('checked', obj.hidezero);
  $('#oshideperc').prop('checked', obj.hideperc);

  if (mapObj.scales[obj.id]) {
    var content = '';
    for (let s of mapObj.scales[obj.id])
      content += scaleRow(s.min, s.max, s.color);

    $('#scaleRows').html(content);
  } else {
    mapObj.scales[obj.id] = [];
    $('#scaleRows').empty();
  }

  $('#editScale').modal('show');
}

function scaleRow(min, max, color) {
  var content = '<div class="row">' +
    '<div class="col"><input type="number" class="form-control form-control-sm" size="3" min="0" max="100" required value="' + min + '"></div><div class="col">' +
    '<input type="number" class="form-control form-control-sm" size="3" min="0" max="100" required value="' + max + '">' +
    '</div><div class="col"><div class="input-group"><input type="text" class="form-control form-control-sm" pattern="#[0-9A-Fa-f]{6}" required value="' + color + '">' +
    '<span class="input-group-btn"><button type="button" class="btn btn-sm btn-danger" onclick="deleteScaleRow(this)">X</button></span></div></div></div>';
  return content;
}

function deleteScaleRow(obj) {
  $(obj).parent().parent().parent().parent().remove();
}

function addScaleRow() {
  $('#scaleRows').append(scaleRow('', '', ''));
}

function applyScale() {
  var row, min, max, color;

  var idx = $('#osIndex').val();

  var obj = mapObj.objects[idx];

  obj.title = $('#ostitle').val();

  // Detect ID change
  var newID = $('#osid').val();
  if (obj.id != newID) {
    for (let key of mapObj.objects) {
      if (key.type == 'link')
        if (key.scale && (key.scale == obj.id))
          key.scale = newID;

      if (key.type == 'node')
        if (key.scale && (key.scale[0] == obj.id))
          key.scale[0] = newID;
    }

    mapObj.scales[newID] = $.extend([], mapObj.scales[obj.id]);
    delete mapObj.scales[obj.id];
    obj.id = newID;
  }

  obj.hidezero = $('#oshidezero').prop('checked');
  obj.hideperc = $('#oshideperc').prop('checked');

  if ($('#osshow').prop('checked')) {
    if (!obj.pos)
      obj.pos = [10, 10];
  } else
    delete obj.pos;

  // Get scale rows
  var rows = $('#scaleRows').find('.row');
  mapObj.scales[obj.id] = [];
  for (let row of rows) {
    inputs = $(row).find('input');
    min = $(inputs[0]).val();
    max = $(inputs[1]).val();
    color = $(inputs[2]).val();
    if ((min == '') || (max == '') || (color == '')) continue;

    mapObj.scales[obj.id].push({min: min, max: max, color: color});
  }

  mapObj.modified = true;
  render();
  reDraw();

  $('#editScale').modal('hide');
}

function align_star() {
  var i, obj, radius, reference, children,
    keys = Object.keys(mapObj.selected);

  // Get only nodes
  keys = keys.filter(function (value) {
    return (mapObj.objects[value].type == 'node');
  });

  reference = mapObj.objects[keys[0]];

  children = [];

  // Gather children list
  for (i in mapObj.objects) {
    obj = mapObj.objects[i];
    if (obj.type == 'link') {
      if (obj.nodes[0] == reference.id)
        children.push(getNodeById(mapObj.objects, obj.nodes[1]));

      if (obj.nodes[1] == reference.id)
        children.push(getNodeById(mapObj.objects, obj.nodes[0]));
    }
  }

  if (children.length > 0) {
    var angle = 2 * Math.PI / children.length;

    for (i in children) {
      obj = mapObj.objects[children[i]];

      // Calculate distance to node
      radius = Math.sqrt(
        (reference.pos[0] - obj.pos[0]) * (reference.pos[0] - obj.pos[0]) +
        (reference.pos[1] - obj.pos[1]) * (reference.pos[1] - obj.pos[1])
      );

      obj.pos = [
        reference.pos[0] + radius * Math.sin(i * angle),
        reference.pos[1] + radius * Math.cos(i * angle)
      ];
    }

    mapObj.modified = true;
    reDraw();
  }

  popup.hide();
  popupOpen = false;
}

function align_space(mode) {
  var max_distance = 0, space, sel_size;

  var keys = Object.keys(mapObj.selected);

  // Get only nodes
  keys = keys.filter(function (value) {
    return (mapObj.objects[value].type == 'node');
  });

  sel_size = keys.length;

  if (sel_size > 0) {
    keys.sort(function (a, b) {
      if (mapObj.objects[a].pos[mode] > mapObj.objects[b].pos[mode])
        return 1;

      if (mapObj.objects[a].pos[mode] < mapObj.objects[b].pos[mode])
        return -1;

      return 0;
    });

    reference = mapObj.objects[keys[0]];

    var max_distance = mapObj.objects[keys[sel_size - 1]].pos[mode] - reference.pos[mode];

    space = Math.round(max_distance / (sel_size - 1));

    for (i = 1; i < sel_size; i++)
      mapObj.objects[keys[i]].pos[mode] = reference.pos[mode] + i * space;

    mapObj.modified = true;
    reDraw();
  }

  popup.hide();
  popupOpen = false;
}

function cacheImageList() {
  $.get('jsm.php', {a: 'img'}, function (data) {
    var olist = $("#odImages");
    olist.empty();
    olist.append($('<option value="">Select from list</option>'));

    for (let key of data)
      olist.append($('<option>' + key + '</option>'));

    var olist1 = $("#mpbackgroundimages");
    olist1.empty();
    olist1.append($('<option value="">Select from list</option>'));

    for (let key of data)
      olist1.append($('<option>' + key + '</option>'));
  });
}

function cleanup(map) {
  // Check links

  // Check templates
  for (let obj of map.objects) {
    if (obj.template) {
      if (getNodeById(map.templates, obj.template, obj.type) == null)
        delete obj.template;
    }
  }
}

function setHandlers() {
  offset = $(map_canvas).offset();

  $('#mapcanvas').mousedown(mouseDown);
  $('#mapcanvas').mouseup(mouseUp);
  $('#mapcanvas').mousemove(mouseMove);
  $('#odImages').click(selectImage);
  $('#mpbackgroundimages').click(selectBgImage);

  // $('#deleteLink').click(deleteLink);
  $('#deleteMap').click(deleteMap);
  $('#deleteFont').click(deleteFont);

  $('#addVIA').click(addVIA);
  $('#addFont').click(addFont);
  $('#editLink').click(editLink);

  $('#applyChanges').click(applyChanges);
  $('#importMap').click(importMap);
  $('#applyMap').click(applyMap);
  $('#applyTime').click(applyTime);
  $('#applyLink').click(applyLink);
  $('#applyScale').click(applyScale);
  $('#applyOptions').click(applyOptions);
  $('#selectMap').click(loadMap);

  $('#maps').dblclick(loadMap);
  $('#odLinks').dblclick(editLink);
  // $('#deleteLink2').click(deleteLink);
  $('#deleteLink').click(deleteLinks);
  $('#clearVIA').click(clearVIA);
  $('#addTemplate').click(addTemplate);
  $('#addScale').click(addScale);
  $('#addScaleRow').click(addScaleRow);

  $('input').change(checkFormField);

  var mapName = $('#mapname').change(function () {
    mapObj.name = $(this).val();
  });

  if (onlineMode) {
    $('#opfilter').keyup(function () {
      setTimeout(function () {
        filterDevlist()
      }, 500);
    });

    $('#pickDialog').on('show.bs.modal', filterDevlist);
    $('#pickDialog').on('hide.bs.modal', function () {
      $($('#pickDialog').attr('data-caller')).modal('show');
    });

  }

  map_canvas.addEventListener('contextmenu', contextMenu, false);
}

/* Special methods for debugging internal format
function getShadow() {
	var shadow = {
		config: mapObj.config,
		templates: mapObj.templates,
		objects: mapObj.objects,
		scales: mapObj.scales,
		fonts: mapObj.fonts
	};

	return JSON.stringify(shadow, null, 2);
}

function exportData() {
	$('#mapinfo').val(getShadow());
	$('#exportDialog').modal('show');
}
*/

$(function () {
  loadSession();
  setHandlers();
  newMap();

  dContext.fillStyle = colors.text;
  dContext.fillText("Add your objects with context-menu",
    mapObj.config.size[0] / 2 - 100,
    mapObj.config.size[1] / 2);

  // Load imagelist
  if (onlineMode)
    cacheImageList();
});
