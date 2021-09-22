// CACTI web path
var cacti_webpath_default = '';
var rra_path_default = '/var/lib/cacti/rra';

// Image cache
var imagesUrl_default = cacti_webpath_default + '/plugins/Weathermap/';

var grid_step_default = 20;
var grid_snap_default = false;
var grid_default = false;

// if online image list is loaded from Weathermap plugin
var onlineMode = true;

// Colors
var colors = {
	selected: "#AA3333",
	grid: ["#F5F5F5", "#F5F5F5"],
	link: "#CCCCCC",
	stroke: "black",
	text: "#000000",
	textout: "#000000",
	via: ["#E5E5E5", "#888888"]
	};

var fixedFonts = {
	1: '6pt monospace',
	2: '8pt monospace',
	3: '10pt monospace',
	4: '12pt monospace',
	5: '14pt monospace'};

var defFont = {title: 2, scale: 2, time: 2, node: 3};

// Tune for performance while dragging
// oddframe = 1 -> draw every second frame
var qq = 0, oddframe = 0;
