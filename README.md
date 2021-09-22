# Librenms Weathermap editor

Librenms weather map editor is an adaptation for librenms of the plugin develop by Vitaly Chekryzhev for editing cacti
weather maps
for installing use the following via ssh:
````
  $ git clone ssh://git@gitlab.edgeuno.net:2288/developers/librenms-weathermap-editor.git#subdirectory=WeathermapEditor
````
Or
````
$ git clone https://gitlab.edgeuno.net/developers/librenms-weathermap-editor.git#subdirectory=WeathermapEditor
````
----

# Original Readme

GUI JS Weathermap editor. Integrates into CACTI as a plugin, but can work separately. NB: Restrict access to php script
with .htaccess or similar ways.

Put wmeditor folder to CACTI plugon folder.

If changes were made then run ./build.sh to prepare distro.

Vitaly Chekryzhev <13hakta@gmail.com>, 2017-2018
https://13hakta.ru
