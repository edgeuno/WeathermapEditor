<?php

echo('Click <a href="plugins/WeathermapEditor/editor/editor.php">here to access the editor</a> where you can create and manage maps.');
$directory = 'plugins/Weathermap/output/';
$images = glob($directory . "*.png");
echo('<div class="container">
    <ul class="list-inline">');
foreach ($images as $image) {
  $overlib = pathinfo($image);
  $overlib = $overlib['dirname'] . '/' . substr($overlib['basename'], 0, strrpos($overlib['basename'], '.')) . '.html';
  echo('<li><a href="' . $overlib . '"><img class="img-responsive" src="' . $image . '"/></a></li>');
}
echo('</ul>
    </div>');
//include("editor/editor.html");
