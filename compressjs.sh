#!/bin/bash

#java -jar ~/Downloads/ClosureCompiler/compiler.jar --js_output_file glu_cc.js --externs glu_externs.js -O ADVANCED --warning_level=VERBOSE \
#--jscomp_warning=checkTypes  \
#    glu.js    \


java -jar ~/Downloads/ClosureCompiler/compiler.jar --js_output_file combined.js --externs cc_externs -O ADVANCED --warning_level=VERBOSE \
--jscomp_warning=checkTypes  \
--formatting        pretty_print \
buildings.js controller.js glu.js helpers.js \
main.js mapLayer.js math.js shaders.js shadows.js skydome.js sun.js tile.js vicinityMap.js


#--formatting        pretty_print \

