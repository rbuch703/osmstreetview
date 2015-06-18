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

/* Fallback triangulation to generate at least some geometry, 
 * if the normal triangulation fails.
 * Approach: ignore any inner rings that might be present, triangulate the outer ring
 *           as a fan. (this always works, even for degenerated geometry) */
function triangulateFallback( outerRing, coordsRef, texCoordsRef)
{
    //first and last vertex are identical --> skip last entry
    for (var j = 1; j+1 < outerRing.length-1; j++)
    {
        coordsRef.push( outerRing[0  ][0], outerRing[0  ][1], outerRing[0  ][2]);
        coordsRef.push( outerRing[j  ][0], outerRing[j  ][1], outerRing[j  ][2]);
        coordsRef.push( outerRing[j+1][0], outerRing[j+1][1], outerRing[j+1][2]);
        
        texCoordsRef.push( outerRing[0  ][3], outerRing[0  ][4]);
        texCoordsRef.push( outerRing[j  ][3], outerRing[j  ][4]);
        texCoordsRef.push( outerRing[j+1][3], outerRing[j+1][4]);
    }
}

function createBase(outerRing)
{
    var p0 = outerRing[0];
    var i = 1;
    while ( i < outerRing.length && equals3(p0, outerRing[i]))
        i += 1;
        
    if (i == outerRing.length)
    {   
        console.log("[ERROR] cannot find non-identical vertices in polygon");
        return null;
    }
    
    var dir1 = norm3(sub3(outerRing[i], p0));
    var dir2 = dir1;
    var dotMin = Infinity;
    for (; i < outerRing.length; i++)
    {
        var d2Tmp = norm3(sub3(outerRing[i], p0));
        var dot = Math.abs(dot3(dir1, d2Tmp));
        if ( dot < dotMin)
        {
            dotMin = dot;
            dir2 = d2Tmp;
        }
    }

    if (dotMin > 0.95)
    {
        //console.log(dotMin);
        //console.log("[WARN] numerical accuracy too low for base transformation; using fallback triangulation");
        return null;
    }

    var normal = cross3( dir1, dir2);
    dir2 = cross3( normal, dir1);

    return [p0, dir1, dir2];
}

function triangulate( outerRing, innerRings, coordsRef, texCoordsRef)
{
    if (! equals3( outerRing[0], outerRing[outerRing.length-1]))
    {
        console.log("[ERR] outer ring is not closed. Skipping polygon");
        return;
    }
    
    for (var i in innerRings)
        if (! equals3( innerRings[i][0], innerRings[i][ innerRings[i].length-1]))
        {
            console.log("[ERR] inner ring is not closed. Skipping polygon");
            return;
        }

    //console.log("triangulate_beep");
    //is a triangle (first==last) --> trivial triangulation
    if (outerRing.length == 4 && innerRings.length == 0)  
        return triangulateFallback(outerRing, coordsRef, texCoordsRef);

    var base = createBase(outerRing);
    if (base === null)
        return triangulateFallback( outerRing, coordsRef, texCoordsRef)

    var p0 = base[0];
    var dir0 = base[1];
    var dir1 = base[2];

    var originalCoords = {};
    var points = [];
    //console.log("polygon has %s vertices", outline.length-1);
    
    
    var prevX = null;
    var prevY = null;
    for (var i = 0; i < outerRing.length - 1; i++) 
    {
        var dir = sub3(outerRing[i], p0);
        var x = dot3( dir, dir0);
        var y = dot3( dir, dir1);
        originalCoords[ [x,y] ] = outerRing[i];
        
        //if (x !== prevX && y !== prevY)
        {
            points.push(new poly2tri.Point( x, y));
        }
        
        prevX = x;
        prevY = y;
    }

    /* triangulation might fail:
     * - when an inner ring touches an outer ring
     * - when edges intersect
     * - when rings are not closed
     * - ...
     * So we wrap triangulation in a try/catch block to handle these invalid cases
     */
    
    try {

        var ctx = new poly2tri.SweepContext(points);
        
        for (var i in innerRings)
        {
            var ring = [];
            var inner = innerRings[i];
            
            for (var j = 0; j < inner.length - 1; j++)
            {
                var dir = sub3(inner[j], p0);
                var x = dot3( dir, dir0);
                var y = dot3( dir, dir1);
                originalCoords[ [x,y] ] = inner[j];
                ring.push(new poly2tri.Point( x, y));
            }
            ctx.addHole(ring);
        }
    
        poly2tri.triangulate(ctx);
    }
    catch(err)
    {
        console.log("triangulation failed: %o", err);
        return triangulateFallback( outerRing, coordsRef, texCoordsRef);
    }
    
    var triangles = ctx.getTriangles();
    
    var coordsTriangulated = [];
    var texCoordsTriangulated = [];
    
    var vertexData = [];
    for (var i in triangles)
    {
        var tri = triangles[i]["points_"];
        var p0 = [tri[0].x, tri[0].y];
        var p1 = [tri[1].x, tri[1].y];
        var p2 = [tri[2].x, tri[2].y];
        if ( ! ( p0 in originalCoords && p1 in originalCoords && p2 in originalCoords))
        {
            console.log("invalid vertex in triangulation result");
            return triangulateFallback( outerRing, coordsRef, texCoordsRef);
        }
        // map back from 2D triangulation results to 3D vertices (plus texCoords)
        p0 = originalCoords[p0];
        p1 = originalCoords[p1];
        p2 = originalCoords[p2];
        coordsTriangulated.push( p0[0], p0[1], p0[2]);
        coordsTriangulated.push( p1[0], p1[1], p1[2]);
        coordsTriangulated.push( p2[0], p2[1], p2[2]);
        
        texCoordsTriangulated.push( p0[3], p0[4]);
        texCoordsTriangulated.push( p1[3], p1[4]);
        texCoordsTriangulated.push( p2[3], p2[4]);
    }
    [].push.apply(coordsRef, coordsTriangulated);
    [].push.apply(texCoordsRef, texCoordsTriangulated);
}

BerlinBuilding.prototype.onDataLoaded = function(req)
{
    if (req.readyState != 4) // != "DONE"
        return;
    
    if (req.status >= 400)  //request error or server-side error
    {
        //console.log("Request %s failed (%s)", req.responseURL, req.status);
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
            //var outer = poly.outer;
            
            toLocal(poly.outer, this.mapCenter);
            for (var j in poly.inner)
                toLocal(poly.inner[j], this.mapCenter);
            
            triangulate(poly.outer, poly.inner, coords, texCoords);
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
        
        if (atlasUri != null && atlasUri !== "null")
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

	//cannot use backface culling for now, as the data set contains incorrectly oriented faces
    gl.disable(gl.CULL_FACE);
    
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
    gl.enable(gl.CULL_FACE);
}

BerlinBuilding.prototype.renderDepth = function(modelViewMatrix, projectionMatrix) {
    if (!Shaders.ready)
        return;
        

    gl.enable(gl.CULL_FACE);
    //HACK: A building casts the same shadow regardless of whether its front of back faces are used in the shadow computation.
    //      The only exception is the building the camera is located in: using front faces would prevent light to be casted on
    //      anything inside the building walls, i.e. no light would fall on anything inside the apartment (since its windows
    //      have to corresponding holes in the buiding geometry. Using only the front faces effectively ignores just the
    //      building the camera is in for the shadow computation, which gives the desired effect to shading the apartment
    gl.cullFace(gl.FRONT);

	gl.useProgram(Shaders.depth);   //    Install the program as part of the current rendering state
	glu.enableVertexAttribArrays(Shaders.depth);

    var mvpMatrix = mat4.create();
    mat4.mul(mvpMatrix, projectionMatrix, modelViewMatrix);

    //gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0
    //gl.bindTexture(gl.TEXTURE_2D, null); //render geometry without texture
    
    for (var i in this.geometries)
    {
        var geometry = this.geometries[i];

        gl.bindBuffer(gl.ARRAY_BUFFER, geometry.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
        gl.vertexAttribPointer(Shaders.depth.locations["vertexPos"], 3, gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    	gl.uniformMatrix4fv(Shaders.depth.locations["modelViewProjectionMatrix"], false, mvpMatrix);

        gl.drawArrays(gl.TRIANGLES, 0, geometry.numVertices);
    }   

    gl.cullFace(gl.BACK);   //reset to normal behavior
    glu.disableVertexAttribArrays(Shaders.depth);
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
    /*var dLat = newPosition.lat - this.mapCenter.lat;
    var dLng = newPosition.lng - this.mapCenter.lng;
    var avgLat = (newPosition.lat + this.mapCenter.lat) / 2.0;*/
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

Buildings.prototype.render = function(modelViewMatrix, projectionMatrix) {
    for (var i in this.buildings)
        this.buildings[i].render(modelViewMatrix, projectionMatrix);
}

Buildings.prototype.renderDepth = function(modelViewMatrix, projectionMatrix) {
    for (var i in this.buildings)
        this.buildings[i].renderDepth(modelViewMatrix, projectionMatrix);
}



/* converts 'buildings' global coordinates (lat/lon) to local distances (in m) from mapCenter*/
/*function convertToLocalCoordinates(latlng,  mapCenter)
{
    
}*/

function toLocal(ring, localCenter)
{
    var circumference  = Helpers.getEarthCircumference();
    var lngScale = Math.cos( localCenter.lat / 180 * Math.PI);

    for (var j in ring)
    {
        var latlng = {lat: ring[j][0], lng: ring[j][1]};
        var dLat = ring[j][0] - localCenter.lat;
        var dLng = ring[j][1] - localCenter.lng;

        var dx = dLng / 360 * circumference * lngScale;
        var dy = -dLat / 360 * circumference;
        ring[j][0] = dx;
        ring[j][1] = dy;
    }
}


