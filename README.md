# Librenms Weathermap editor

LibreNMS Weather map editor is an adaptation for LibreNMS of the plugin developed by Vitaly Chekryzhev for editing cacti
weather maps.
 To install use the following commands:

````
  $ git clone git@github.com:edgeuno/WeathermapEditor.git
````

Or

````
$ git clone https://github.com/edgeuno/WeathermapEditor.git
````

## Configuration

Move into the WeathermapEditor/editor directory and make a copy of setup.inc.default.php named setup.inc.php. This file
will hold all of your local configuration parameters.

```
cd WeathermapEditor/editor
sudo cp setup.inc.default.php setup.inc.php
```

The following parameters must be configured:

- librenms_base
- mapdir
- imgdir

It is assumed that the Weathermap plugin is already installed.

### librenms_base

Real path for the LibreNMS installation

```injectablephp
$librenms_base = realpath(dirname(__FILE__) . '/../../../../');
```

### mapdir

Path for the directory where the map configuration files are going to be saved

```injectablephp
$mapdir = $librenms_base . '/html/plugins/Weathermap/configs';
```

### imgdir

Path for the directory where the images are going to be saved

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

# Thanks

- To Edgeuno for the support, visit at https://edgeuno.com/
- To 13hakta for the work, visit at https://13hakta.ru

# Links

- Release blog post for the cacti plugin https://13hakta.ru/blog/wmap.html
- Repository for the cacti plugin https://gitlab.com/13hakta/wmeditor
