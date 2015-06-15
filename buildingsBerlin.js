"use strict"
/* Copyright (c) 2014, Robert Buchholz <rbuch703@gmail.com> 
   The contents of this file are licensed under the GNU General Public License version 3
   (see the LICENSE file in the project root for details)
*/

function BerlinBuilding(x, y, mapCenter, lod)
{
    this.num = [x, y];
    this.mapCenter = mapCenter;
    this.geometries = [];
    this.lod = lod;
    
    //var bldgs = this;
    var oReq = new XMLHttpRequest();
    var tmp = this;
    oReq.onload = function() { tmp.onDataLoaded(oReq); }
    oReq.overrideMimeType("text/plain");
    oReq.open("get", "atlas/" + x + "_" + y + ".json", true);
    oReq.send();
        
}

function createTextureLoadHandler( texture, image)
{
    return function()
    {
        glu.updateTexture( texture, image);
        
        if (Controller.onRequestFrameRender)
            Controller.onRequestFrameRender();
    };
}

BerlinBuilding.prototype.onDataLoaded = function(req)
{
    if (req.readyState != 4) // != "DONE"
        return;
    
    if (req.status >= 400)  //request error or server-side error
    {
        console.log("Request %o failed", req);
        return;
    }
        
    var data = JSON.parse(req.responseText);
    var suffix = ".quarter";
    if (this.lod == 1)
        suffix = ".half";
    else if (this.lod == 0)
        suffix = "";
        
    for (var atlasUri in data)
    {
        var coords = [];
        var texCoords = [];
        var polygons = data[atlasUri];
        //console.log(atlasUri, polygons);
        
        for (var i in polygons)
        {
            var poly = polygons[i];
            var outer = poly.outer;
            
            for (var j in outer)
            {
                var latlng = {lat: outer[j][0], lng: outer[j][1]};
                var localPos = convertToLocalCoordinates(latlng,  this.mapCenter);
                outer[j][0] = localPos[0];
                outer[j][1] = localPos[1];
                //outer[j][2];
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

        
        var geometry = {
            rawVertices : coords,
            vertices : glu.createArrayBuffer(coords),
            rawTexCoords : texCoords,
            texCoords : glu.createArrayBuffer(texCoords),
            numVertices: (coords.length / 3)|0,
        }

        var blue = Math.random()* 256;
        geometry.texture = glu.createTextureFromBytes(
            new Uint8Array([  0,   0, blue,
                            255,   0, blue,
                              0,   0,    // 4 byte boundary alignment bytes
                              0, 255, blue,
                            255, 255, blue]
                           ), 2, 2);
        
        if (atlasUri)
        {
            var image = new Image();
            image.onload = createTextureLoadHandler( geometry.texture, image);
            image.src = atlasUri + suffix;
        }
        
        this.geometries.push(geometry);

    }
}

BerlinBuilding.prototype.render = function(modelViewMatrix, projectionMatrix)
{
    if (!Shaders.ready)
        return;
    
    gl.useProgram(Shaders.textured);   //    Install the program as part of the current rendering state
    glu.enableVertexAttribArrays(Shaders.textured);
    var mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, projectionMatrix, modelViewMatrix);

    for (var i in this.geometries)
    {
        var geometry = this.geometries[i];

        gl.bindBuffer(gl.ARRAY_BUFFER, geometry.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
        gl.vertexAttribPointer(Shaders.textured.locations["vertexPosition"], 3, gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
        
        gl.bindBuffer(gl.ARRAY_BUFFER, geometry.texCoords);
        gl.vertexAttribPointer(Shaders.textured.locations["vertexTexCoords"], 2, gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"*/

        gl.uniform1i(Shaders.textured.locations["tex"], 0); //select texture unit 0 as the source for the shader variable "tex" 
        gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0
        gl.bindTexture(gl.TEXTURE_2D, geometry.texture);  //render geometry using texture "tex" in texture unit 0
        
        gl.uniformMatrix4fv(Shaders.textured.locations["modelViewProjectionMatrix"], false, mvpMatrix);

        gl.drawArrays(gl.TRIANGLES, 0, geometry.numVertices);

    }   

    glu.disableVertexAttribArrays(Shaders.textured); //cleanup
}


/**
 * @constructor
 */
function Buildings(gl, position)
{
    if (!gl)
        return;

    this.mapCenter = position;//{lat:52.13850380245244, lng:11.64003610610962};
    this.buildings = {};
    this.loadGeometry(position);    
}    

function vec(a) { return [a.dx, a.dy];}

Buildings.prototype.GEO_TILE_ZOOM_LEVEL = 17;
Buildings.prototype.RADIUS = 2;

Buildings.prototype.loadGeometry = function(location)
{
    //console.log(location);
    for (var pos in this.buildings)
    {
        gl.deleteBuffer(this.buildings[pos].vertices);
        gl.deleteBuffer(this.buildings[pos].texCoords);
        gl.deleteTexture(this.texture);
        
    }
    this.buildings = {};

    var xCenter = Math.floor(long2tile( location.lng, this.GEO_TILE_ZOOM_LEVEL));
    var yCenter = Math.floor(lat2tile(  location.lat, this.GEO_TILE_ZOOM_LEVEL));
    //console.log(xCenter, yCenter);
    for (var x = xCenter - this.RADIUS; x <= xCenter + this.RADIUS; x++)
        for (var y = yCenter - this.RADIUS; y <= yCenter + this.RADIUS; y++)
        {
            var lod = Math.max( Math.abs(xCenter - x), Math.abs(yCenter - y));
            this.buildings[ [x, y] ] = new BerlinBuilding(x, y, location, lod );
        }

}

Buildings.prototype.shiftGeometry = function(newPosition)
{
    //console.log("shift")
    var dLat = newPosition.lat - this.mapCenter.lat;
    var dLng = newPosition.lng - this.mapCenter.lng;
    var avgLat = (newPosition.lat + this.mapCenter.lat) / 2.0;
    this.mapCenter = newPosition;
    this.loadGeometry( this.mapCenter);
    /*if (dLat > 1 || dLng > 1)   //distance too far for the old geometry to still be visible --> just don't display anything
    {
        return;
    }*/
    
    /*var dy = dLat/360 * Helpers.getEarthCircumference();
    var dx = dLng/360 * Helpers.getEarthCircumference() * Math.cos( avgLat / 180 * Math.PI);
    //console.log("delta: %s, %s", dx, dy);
    
    for (pos in this.buildings)
    {
        var building = this.buildings[pos]
        for (var i = 0; i < building.verticesRaw.length; i+=3)
        {
            this.verticesRaw[i  ] -= dx;
            this.verticesRaw[i+1] += dy;
        }
        
        if (this.vertices)
            gl.deleteBuffer(this.vertices);
            
        this.vertices = glu.createArrayBuffer(this.verticesRaw);
    }*/
}

// dummy method, for compatibility with the OSM-based buildings.js
Buildings.prototype.requestGeometry = function (newPosition)
{
    
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


Buildings.prototype.render = function(modelViewMatrix, projectionMatrix) {
    for (var i in this.buildings)
        this.buildings[i].render(modelViewMatrix, projectionMatrix);
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


