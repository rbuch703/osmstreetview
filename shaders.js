"use strict"

/* Copyright (c) 2014, Robert Buchholz <rbuch703@gmail.com> 
   The contents of this file are licensed under the GNU General Public License version 3
   (see the LICENSE file in the project root for details)
*/

var Shaders = {

    init: function(errorOutput) 
    {
    
        var req = new XMLHttpRequest();
        Shaders.errorOutput = errorOutput;
        req.open("GET", "shaders.xml" );
        req.onreadystatechange = function() 
        { 
            if (req.readyState != 4 || req.response == null)
                return;

            //manual parsing is not the most direct approach, but more cross-browser compatible
            var parser = new DOMParser();
            Shaders.onShadersRetrieved(parser.parseFromString(req.responseText, "application/xml"));
        }
        req.send();

    },
    
    onShadersRetrieved: function(dom) 
    {
        var scripts = dom.getElementsByTagName("script");
        //console.log("%o", scripts);
        Shaders.shaderSource = {};
        for (var i = 0; i < scripts.length; i++)
        {
            var type = scripts[i].attributes["type"].value;
            //console.log(type);
            var id   = scripts[i].attributes["id"  ].value;
            var shaderSrc = scripts[i].textContent;
            if (type != "x-shader/x-vertex" && type != "x-shader/x-fragment")
            {
                console.log("[WARN] unknown script type: %s for script %o", type, scripts[i]);
                continue;
            }
            
            if (id === undefined || id === null)
            {
                console.log("[WARN] shader %o has no id, skipping", scripts[i]);
                continue;
            }
            
            Shaders.shaderSource[id] = shaderSrc;
        }
    
        //don't need the depth shader otherwise
        if (glu.performShadowMapping)
            Shaders.depth = glu.createShader(Shaders.shaderSource["depth-shader-vs"],
                                         Shaders.shaderSource["depth-shader-fs"],
                                         ["vertexPosition"],
                                         ["modelViewProjectionMatrix", "lightPos"],
                                         Shaders.errorOutput);

        Shaders.building = glu.createShader( Shaders.shaderSource["building-shader-vs"],
                                             Shaders.shaderSource["building-shader-fs"],
                                             ["vertexPosition","vertexTexCoords", "vertexNormal", "vertexColorIn"],
                                             ["modelViewProjectionMatrix", "tex", "cameraPos"],
                                             Shaders.errorOutput);
        
        Shaders.flat = glu.createShader( Shaders.shaderSource["flat-shader-vs"],
                                         Shaders.shaderSource["flat-shader-fs"],
                                         ["vertexPosition"], ["modelViewProjectionMatrix", "color"],
                                         Shaders.errorOutput);

        Shaders.textured = glu.createShader( Shaders.shaderSource["texture-shader-vs"], 
                                          Shaders.shaderSource["texture-shader-fs"],
                                          ["vertexPosition","vertexTexCoords"], 
                                          ["modelViewProjectionMatrix", "tex"],
                                          Shaders.errorOutput);

        Shaders.shadow = glu.performShadowMapping ? 
                        glu.createShader(  Shaders.shaderSource["shadowed-shader-vs"], 
                                         Shaders.shaderSource["shadowed-texture-shader-fs"],
                                         ["vertexPosition", "normalIn", "vertexTexCoords"],
                                         ["modelViewProjectionMatrix", "sunDir", "shadowMatrix", "tex", "shadowTex"],
                                         Shaders.errorOutput) : Shaders.textured;


        Shaders.ready = true;
        scheduleFrameRendering();
        //console.log(shaders);
    
    }

}

