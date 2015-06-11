"use strict"
/* Copyright (c) 2014, Robert Buchholz <rbuch703@gmail.com> 
   The contents of this file are licensed under the GNU General Public License version 3
   (see the LICENSE file in the project root for details)
*/

function BerlinBuilding(x, y, mapCenter, textureStorage)
{
    this.num = [x, y];
    this.mapCenter = mapCenter;
    this.textureStorage = textureStorage;
    this.isRenderable = false;

    var bldgs = this;
    var oReq = new XMLHttpRequest();
    var tmp = this;
    oReq.onload = function() { tmp.onDataLoaded(oReq, textureStorage); }
    oReq.overrideMimeType("text/plain");
    oReq.open("get", "json2/" + x + "_" + y + ".json.tmp", true);
    oReq.send();
    
    
    this.texture = glu.createTextureFromBytes(
        new Uint8Array([  0,   0, 0, // black
                        255,   0, 0, // red
                          0,   0,    // 4 byte boundary alignment bytes
                          0, 255, 0, // green
                        255, 255, 0] // yellow
                       ), 2, 2);

    var image = new Image();
    image.onload = createTextureLoadHandler( this.texture, image);
    image.src = "atlas/"+x+"_"+y+".jpg";
    
}

function createTextureLoadHandler( texture, image)
{
    return function()
    {
        //console.log("+1");
        console.log("updating texture %o", image);
        glu.updateTexture( texture, image);
        
        if (Controller.onRequestFrameRender)
            Controller.onRequestFrameRender();
    };
}

function requestTexture(textureStorage, textureName)
{
        
    if (textureName in textureStorage)  //already exists, nothing to do
        return;
        
    /* no texture exists yet --> create a small dummy texture at once, and
       schedule loading of the actual texture
     */
     
    var rand = [];
    // 2x2 random pixels --> twelve random bytes plus plus two alignment bytes to the four byte boundary for the first row
    for (var j = 0; j < 14; j++)
        rand.push( Math.random()*255);
    textureStorage[textureName] = glu.createTextureFromBytes( new Uint8Array(rand), 2, 2 );
    
    if (textureName != "dummy")
    {
        textureStorage[textureName].actualTextureLoaded
        //console.log("texture name is %o", part.texName)
        var image = new Image();
        image.onload = createTextureLoadHandler( textureStorage[textureName], image);
        image.src = textureName;
    }

}

BerlinBuilding.prototype.onDataLoaded = function(req, textureStorage)
{
    var data = JSON.parse(req.responseText);
    var coords = [];
    var texCoords = [];
    
    for (var i in data)
    {
        var poly = data[i];
        var outer = poly.outer;
        
        //FIXME: hard-coded base height
        var BASE_HEIGHT = 47.7700004577637;
        for (var j in outer)
        {
            var latlng = {lat: outer[j][0], lng: outer[j][1]};
            var localPos = convertToLocalCoordinates(latlng,  this.mapCenter);
            outer[j][0] = localPos[0];
            outer[j][1] = localPos[1];
            outer[j][2] -= BASE_HEIGHT;
        }
        
        //FIXME: We triangulate each polygon as a fan, which will fail for most concave ones
        //TODO:  Change this to perform an actual triangulation (including holes)
        
        //if (outer.length <= 5 && poly.inner.length == 0)
        for (var j = 1; j+1 < outer.length; j++)
        {
            [].push.apply( coords, [outer[0  ][0], outer[0  ][1], outer[0  ][2]]);
            [].push.apply( coords, [outer[j  ][0], outer[j  ][1], outer[j  ][2]]);
            [].push.apply( coords, [outer[j+1][0], outer[j+1][1], outer[j+1][2]]);
            
            [].push.apply( texCoords, [outer[0  ][3], outer[0  ][4]]);
            [].push.apply( texCoords, [outer[j  ][3], outer[j  ][4]]);
            [].push.apply( texCoords, [outer[j+1][3], outer[j+1][4]]);
        }
        //console.log(coords[0], coords[1]);
    }

    this.vertices = glu.createArrayBuffer(coords);
    this.texCoords = glu.createArrayBuffer(texCoords);
    this.numVertices = (coords.length / 3)|0;
    //console.log(this);
    this.isRenderable = true;
    //texUri: poly.texUri
        
        //FIXME: load texture
        
        //requestTexture(textureStorage, poly.texUri);
        //this.parts.push(part);
}

BerlinBuilding.prototype.render = function(modelViewMatrix, projectionMatrix)
{
    if (!Shaders.ready)
        return;
    
    if (!this.isRenderable)
        return;
        
    //return;
	gl.useProgram(Shaders.textured);   //    Install the program as part of the current rendering state
	glu.enableVertexAttribArrays(Shaders.textured);
	glu.enableVertexAttribArrays(Shaders.textured);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
    gl.vertexAttribPointer(Shaders.textured.locations["vertexPosition"], 3, gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoords);
    gl.vertexAttribPointer(Shaders.textured.locations["vertexTexCoords"], 2, gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"*/

    gl.uniform1i(Shaders.textured.locations["tex"], 0); //select texture unit 0 as the source for the shader variable "tex" 
    
    var mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, projectionMatrix, modelViewMatrix);
    gl.uniformMatrix4fv(Shaders.textured.locations["modelViewProjectionMatrix"], false, mvpMatrix);

    gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0
    //console.log(this.textureStorage[part.texName]);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
        //this.textureStorage[part.texUri]); //render geometry using texture "tex" in texture unit 0
    gl.drawArrays(gl.TRIANGLES, 0, this.numVertices);

	glu.disableVertexAttribArrays(Shaders.textured); //cleanup
        
    //step 2: draw outline
    /*gl.useProgram(Shaders.flat);   //    Install the program as part of the current rendering state
	glu.enableVertexAttribArrays(Shaders.flat); // setup vertex coordinate buffer
	
	for (var i in this.parts)
	//var i = 0;
	{
	    var part = this.parts[i];

        gl.bindBuffer(gl.ARRAY_BUFFER, part.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	    gl.vertexAttribPointer(Shaders.flat.locations["vertexPosition"], 3, gl.FLOAT, false, 0, 0);  //assigns array "edgeVertices" bound above as the vertex attribute "vertexPosition"

        var mvpMatrix = mat4.create();
        mat4.mul(mvpMatrix, projectionMatrix, modelViewMatrix);
	    gl.uniformMatrix4fv(Shaders.flat.locations["modelViewProjectionMatrix"], false, mvpMatrix);
	
	    gl.uniform4fv( Shaders.flat.locations["color"], [0.8, 0.2, 0.2, 1.0]);

        gl.drawArrays(gl.TRIANGLE_FAN, 0, part.numVertices);
    }
	glu.disableVertexAttribArrays(Shaders.flat); */


    //FIXME: add code
}


/**
 * @constructor
 */
function Buildings(gl, position)
{
    if (!gl)
        return;
    this.mapCenter = position;//{lat:52.13850380245244, lng:11.64003610610962};

    this.windowTexture = glu.createTextureFromBytes( new Uint8Array([255, 255, 255]) );
    gl.bindTexture(gl.TEXTURE_2D, this.windowTexture);
    //to allow tiling of windows
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    var image = new Image();
    var bldgs = this;
    image.onload = function() 
    {
        glu.updateTexture( bldgs.windowTexture, image);
        
        if (Controller.onRequestFrameRender)
            Controller.onRequestFrameRender();
    };
    image.src = "images/window.png";
    
    //FIXME: terrible hack to make a texture globally accessible
    window.berlinBuildingsTexture = glu.createTextureFromBytes(
        new Uint8Array([  0,   0, 0, // black
                        255,   0, 0, // red
                          0,   0,    // 4 byte boundary alignment bytes
                          0, 255, 0, // green
                        255, 255, 0] // yellow
                       ), 2, 2);

    this.numVertices = 0;
    this.numEdgeVertices = 0;
    

    this.buildings = [];
    this.textureStorage = {};
    var GEO_TILE_ZOOM_LEVEL = 17;
    var RADIUS = 0;
    var xCenter = 70415;//Math.floor(long2tile( position.lng, GEO_TILE_ZOOM_LEVEL));
    var yCenter = 42974;//Math.floor(lat2tile(  position.lat, GEO_TILE_ZOOM_LEVEL));
    console.log(xCenter, yCenter);
    //for (var i = 1; i < 200; i++)
    for (var x = xCenter - RADIUS; x <= xCenter + RADIUS; x++)
        for (var y = yCenter - RADIUS; y <= yCenter + RADIUS; y++)
            this.buildings.push(
                new BerlinBuilding(x, y, this.mapCenter, this.textureStorage));
    
}    

function vec(a) { return [a.dx, a.dy];}



Buildings.prototype.shiftGeometry = function(newPosition)
{
    var dLat = newPosition.lat - this.mapCenter.lat;
    var dLng = newPosition.lng - this.mapCenter.lng;
    var avgLat = (newPosition.lat + this.mapCenter.lat) / 2.0;
    this.mapCenter = newPosition;
    
    if (dLat > 1 || dLng > 1)   //distance too far for the old geometry to still be visible --> just don't display anything
    {
        this.numVertices = 0;
        this.numEdgeVertices = 0;
        return;
    }
    
    var dy = dLat/360 * Helpers.getEarthCircumference();
    var dx = dLng/360 * Helpers.getEarthCircumference() * Math.cos( avgLat / 180 * Math.PI);
    //console.log("delta: %s, %s", dx, dy);
    
    for (var i = 0; i < this.verticesRaw.length; i+=3)
    {
        this.verticesRaw[i  ] -= dx;
        this.verticesRaw[i+1] += dy;
    }
    
    if (this.vertices)
        gl.deleteBuffer(this.vertices);
        
    this.vertices = glu.createArrayBuffer(this.verticesRaw);

    for (var i = 0; i < this.edgeVerticesRaw.length; i+=3)
    {
        this.edgeVerticesRaw[i  ] -= dx;
        this.edgeVerticesRaw[i+1] += dy;
    }

    if (this.edgeVertices) 
        gl.deleteBuffer(this.edgeVertices);
        
    this.edgeVertices = glu.createArrayBuffer(this.edgeVerticesRaw);
    
    //this.edgeVerticesRaw
    //this.mapCenter
}


function triangulate(outline)
{
    //console.log("triangulating outline %o", outline);
    var points = [];
    //console.log("polygon has %s vertices", outline.length-1);
    if ((outline[0].dx != outline[outline.length-1].dx) ||
        (outline[0].dy != outline[outline.length-1].dy))
        console.log("[ERR] Non-closed polygon in outline.");
    
    for (var i = 0; i < outline.length - 1; i++) 
    {
        points.push(new poly2tri.Point( outline[i].dx, outline[i].dy));
    }
    
    var ctx = new poly2tri.SweepContext(points);
    poly2tri.triangulate(ctx);
    var triangles = ctx.getTriangles();
    var vertexData = [];
    for (var i in triangles)
    {
        var tri = triangles[i];
        //console.log(tri);
        vertexData.push( tri["points_"][0].x, tri["points_"][0].y);
        vertexData.push( tri["points_"][1].x, tri["points_"][1].y);
        vertexData.push( tri["points_"][2].x, tri["points_"][2].y);
    }
    return vertexData;
    //console.log(vertexData);
    
}


Buildings.prototype.buildGlGeometry = function(outlines) {
}

Buildings.prototype.render = function(modelViewMatrix, projectionMatrix) {
    for (var i in this.buildings)
        this.buildings[i].render(modelViewMatrix, projectionMatrix);
    /*
    if (! this.numVertices || !Shaders.ready)
        return;
        
    //draw faces
	gl.useProgram(Shaders.building);   //    Install the program as part of the current rendering state
    glu.enableVertexAttribArrays(Shaders.building);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(Shaders.building.locations["vertexPosition"], 3, gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
	gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoords);
	gl.vertexAttribPointer(Shaders.building.locations["vertexTexCoords"], 2, gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"

    if (Shaders.building.locations["vertexColorIn"] > -1)
    {
	    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexColors);
	    gl.vertexAttribPointer(Shaders.building.locations["vertexColorIn"], 3, gl.FLOAT, false, 0, 0);
	}

    // can apparently be -1 if the variable is not used inside the shader
    if (Shaders.building.locations["vertexNormal"] > -1)
    {
	    gl.bindBuffer(gl.ARRAY_BUFFER, this.normals);
	    gl.vertexAttribPointer(Shaders.building.locations["vertexNormal"], 3, gl.FLOAT, false, 0, 0);  //assigns array "normals"
	}

    var mvpMatrix = mat4.create();
    mat4.mul(mvpMatrix, projectionMatrix, modelViewMatrix);

    gl.uniform1i(Shaders.building.locations["tex"], 0); //select texture unit 0 as the source for the shader variable "tex" 
    gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, this.windowTexture); //render geometry without texture

	gl.uniformMatrix4fv(Shaders.building.locations["modelViewProjectionMatrix"], false, mvpMatrix);

    var pos = Controller.localPosition;
    gl.uniform3f(Shaders.building.locations["cameraPos"], pos.x, pos.y, pos.z);
    
    gl.enable(gl.POLYGON_OFFSET_FILL);  //to prevent z-fighting between rendered edges and faces
    gl.polygonOffset(1,1);

    gl.drawArrays(gl.TRIANGLES, 0, this.numVertices);

    gl.disable(gl.POLYGON_OFFSET_FILL);
    glu.disableVertexAttribArrays(Shaders.building);
    
    // ===
    //step 2: draw outline
    gl.useProgram(Shaders.flat);   //    Install the program as part of the current rendering state
	glu.enableVertexAttribArrays(Shaders.flat); // setup vertex coordinate buffer

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeVertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(Shaders.flat.locations["vertexPosition"], 3, gl.FLOAT, false, 0, 0);  //assigns array "edgeVertices" bound above as the vertex attribute "vertexPosition"

    mvpMatrix = mat4.create();
    mat4.mul(mvpMatrix, projectionMatrix, modelViewMatrix);
	gl.uniformMatrix4fv(Shaders.flat.locations["modelViewProjectionMatrix"], false, mvpMatrix);
	
	gl.uniform4fv( Shaders.flat.locations["color"], [0.2, 0.2, 0.2, 1.0]);

    gl.drawArrays(gl.LINES, 0, this.numEdgeVertices);

	glu.disableVertexAttribArrays(Shaders.flat); // cleanup*/
    
}


/* converts 'buildings' global coordinates (lat/lon) to local distances (in m) from mapCenter*/
function convertToLocalCoordinates(latlng,  mapCenter)
{
    var circumference  = Helpers.getEarthCircumference();
    var lngScale = Math.cos( mapCenter.lat / 180 * Math.PI);
    
    var dLat = latlng.lat - mapCenter.lat;
    var dLng = latlng.lng - mapCenter.lng;

    var dx = dLng / 360 * circumference * lngScale;
    var dy = -dLat / 360 * circumference;
    return [dx, dy];
}


