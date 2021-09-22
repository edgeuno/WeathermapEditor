<?php
/*
 * Backend for WMap editor
 * Vitaly Chekryzhev <13hakta@gmail.com>, 2017
 */

//Load Configuration setup
require_once 'setup.inc.php';

require $librenms_base . '/includes/init.php';

$weathermap_config = array(
  'show_interfaces' => 'all',
  'sort_if_by' => 'ifAlias',
);


$wmdir = $mapdir;
//$imgdir = $imgdir;

$link = NULL;

function update_source_step1($graphid): array
{
  // This is the section that sets the Node Properties
  $graph_url = '/';
  $hover_url = '/';

  $base_url = isset($config['base_url']) ? $config['base_url'] : '/';

  $graph_url = $base_url . 'graph.php?height=100&width=512&device=' . $graphid . '&type=device_bits&legend=no';
  $info_url = $base_url . 'device/device=' . $graphid . '/';

  return [$graph_url, $info_url];

}


$action = $_REQUEST['a'];

switch ($action) {
  case 'list':
    header('Content-Type: application/json');
    $list = array();
    if ($handle = opendir($wmdir)) {
      while (false !== ($entry = readdir($handle))) {
        if (substr($entry, -5, 5) == '.conf') {
          $entry = str_replace('.conf', '', $entry);
          $list[] = $entry;
        }
      }
      closedir($handle);
    }

    sort($list);

    echo json_encode($list);

    break;

  case 'img':
    $list = array();

    $imgArray = array('png', 'jpg', 'jpeg', 'bmp');

    if ($handle = opendir($imgdir)) {
      while (false !== ($entry = readdir($handle))) {
        $file_ext = substr($entry, strrpos($entry, '.') + 1);
        if (in_array($file_ext, $imgArray))
          $list[] = 'images/' . $entry;
      }
      closedir($handle);
    }

    sort($list);
    header('Content-Type: application/json');
    echo json_encode($list);

    break;

  case 'save':
    $name = htmlentities(trim($_POST['name']));
    $name = str_replace(array('.', '/'), '', $name);
    $data = $_POST['data'];
    $filename = $wmdir . '/' . $name . '.conf';

    $fp = fopen($filename, 'w');
    fwrite($fp, $data);
    fclose($fp);
    header('Content-Type: application/json');
    $list[] = array('Finish');
    echo json_encode($list);
    break;

  case 'get':
    $name = htmlentities(trim($_GET['name']));
    $name = str_replace(array('.', '/'), '', $name);

    $filename = $wmdir . '/' . $name . '.conf';
    readfile($filename);
    break;

  case 'delete':
    $name = htmlentities(trim($_POST['name']));
    $name = str_replace(array('.', '/'), '', $name);

    $filename = $wmdir . '/' . $name . '.conf';

    unlink($filename);
    break;

  case 'dev':
    $filter = htmlentities(trim($_GET['filter']));
    require $librenms_base . '/includes/init.php';

    if(!is_null($filter) && $filter !== ''){
      $hosts = \App\Models\Device::where('hostname', 'like', "%$filter%")->get(['device_id AS id', 'hostname AS name', 'ip AS description']);
    }else {
      $hosts = \App\Models\Device::orderBy('hostname')->get(['device_id AS id', 'hostname AS name', 'hardware AS description']);
    }
    $list = array();
    if ($hosts->isNotEmpty()) {
      foreach ($hosts as $host) {
        $key = $host['id'];
        $name = $host['name'];
        $graphArray = update_source_step1($key);
        $list[$key . ''] = array($host['description'], $host['name'], $graphArray[0], $graphArray[1]);
      }
    }
    header('Content-Type: application/json');
    echo json_encode($list);

    break;

  case 'data':
    $dev = intval(htmlentities(trim($_GET['dev'])));

    if (!$dev) return '';
    require $librenms_base . '/includes/init.php';
    $base_url = isset($config['base_url']) ? $config['base_url'] : '';
    $list = array();
    if ($dev != 0) {
      $devices = \App\Models\Device::when($dev > 0, function ($query) use ($dev) {
        $query->where('device_id', $dev);
      })
        ->with(['ports' => function ($query) use ($weathermap_config) {
          $query->orderBy($weathermap_config['sort_if_by']);
        }])
        ->orderBy('hostname')
        ->get();
    }
    $i = 0;
    if (!is_null($devices)) {
      foreach ($devices as $device) {
        if (!is_null($device->ports)) {
          foreach ($device->ports as $port) {
            $rra_path = './' . $device->hostname . '/port-id';
            $fullpath = $rra_path . $port->port_id . '.rrd:INOCTETS:OUTOCTETS';;
            $graph_url = $base_url . 'graph.php?height=100&width=512&id=' . $port->port_id . '&type=port_bits&legend=no';
            $info_url = $base_url . 'graphs/type=port_bits/id=' . $port->port_id . '/';
            $list[] = array($port->port_id, $device->displayName() . "/$port->ifDescr Desc: $port->ifAlias", $fullpath, $graph_url, $info_url);
          }
          $i++;
        }

      }
    }

    header('Content-Type: application/json');
    echo json_encode($list);

    break;

//  case 'graph':
//
//    $data_id = intval(htmlentities(trim($_GET['data'])));
//
//    if (!$data_id) return '';
//
////    connectDB();
////
////    $query = sprintf("select graph_templates_item.local_graph_id FROM graph_templates_item,graph_templates_graph,data_template_rrd where graph_templates_graph.local_graph_id=graph_templates_item.local_graph_id and task_item_id=data_template_rrd.id and local_data_id=%d LIMIT 1;", $data_id);
////
////    if ($result = $link->query($query)) {
////      $row = $result->fetch_assoc();
//    $list = array('local_graph_id');
////    } else $list = 'error';
//
////    $result->free();
//
//    header('Content-Type: application/json');
//    echo json_encode($list);
//
////    $link->close();
//    break;
}

?>
