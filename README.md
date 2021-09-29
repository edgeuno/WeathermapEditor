# Librenms Weathermap editor

Librenms weather map editor is an adaptation for librenms of the plugin develop by Vitaly Chekryzhev for editing cacti
weather maps for installing use the following via ssh:

````
  $ git clone ssh://git@gitlab.edgeuno.net:2288/developers/WeathermapEditor.git
````

Or

````
$ git clone https://gitlab.edgeuno.net/developers/WeathermapEditor.git
````

## Configuration

Move into the WeathermapEditor/editor directory and make a copy of setup.inc.default.php named setup.inc.php. This file
will hold all of your local configuration parameters.

```
cd WeathermapEditor/editor
sudo cp setup.inc.default.php setup.inc.php
```

The following parameters are needed:

- librenms_base
- mapdir
- imgdir

As default is assume that the Weathermap plugin is installed

### librenms_base

Real path for the librenms installation

```injectablephp
$librenms_base = realpath(dirname(__FILE__) . '/../../../../');
```

### mapdir

Path for the directory where the map configuration files are going to be save

```injectablephp
$mapdir = $librenms_base . '/html/plugins/Weathermap/configs';
```

### mapdir

Path for the directory where the map configuration files are going to be save

```injectablephp
$imgdir = $librenms_base . '/html/plugins/Weathermap/images';
```

----

# Original Readme

GUI JS Weathermap editor. Integrates into CACTI as a plugin, but can work separately. NB: Restrict access to php script
with .htaccess or similar ways.

Put wmeditor folder to CACTI plugon folder.

If changes were made then run ./build.sh to prepare distro.

Vitaly Chekryzhev <13hakta@gmail.com>, 2017-2018
https://13hakta.ru
