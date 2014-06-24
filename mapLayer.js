"use strict"
function MapLayer(gl, position) {
    //console.log("MapLayer created");
    /*this.gl = gl;
    if (!gl)
        return;
    // request OSM tiles for texturing
    //var map = this;


    for (var zoom = MapLayer.MIN_ZOOM; zoom <= MapLayer.MAX_ZOOM; zoom++)
    {
        this.createTile(position, zoom);
    }
    
    //construct geometry (including texture coordinates) to render the tiles on
    var geometry = [];
    var tc = [];
    var tcPerTile = [0,0, 1,0, 1,1, 0,0, 1,1, 0,1];
    for (var zoom = MapLayer.MIN_ZOOM; zoom <= MapLayer.MAX_ZOOM; zoom++)
    {
        // formulas taken from http://wiki.openstreetmap.org/wiki/Zoom_levels 
        var earthCircumference = 2 * Math.PI * (6378.1 * 1000);
        var physicalTileLength = earthCircumference* Math.cos(position.lat/180*Math.PI) / Math.pow(2, zoom);
        //console.log("length of tiles at zoom level %s is %s", zoom, physicalTileLength);
        //var halfWidth = 0.5 * physicalTileLength;

        //tile rectangle, specified as two triangles (height of zoom/100 is used to prevent z-fighting).
         // These geometry tiles are twice as wide as 'physicalTileLength' as they consist of 2x2 OSM tiles
         //
        geometry = geometry.concat([-physicalTileLength, -physicalTileLength, zoom/100,
                                     physicalTileLength, -physicalTileLength, zoom/100,
                                     physicalTileLength,  physicalTileLength, zoom/100,
                                    -physicalTileLength, -physicalTileLength, zoom/100,
                                     physicalTileLength,  physicalTileLength, zoom/100,
                                    -physicalTileLength,  physicalTileLength, zoom/100]);
        tc.push.apply(tc, tcPerTile);
    }
    
    
    this.vertices = glu.createArrayBuffer(geometry);
    this.texCoords=glu.createArrayBuffer(tc);
    this.textures = [];
    this.numTiles = geometry.length/(3*6); //six vertices per tile, three coordinates per vertex
    this.numTilesLoaded = 0;*/
    
	//compile and link shader program
	var vertexShader   = glu.compileShader( document.getElementById("shader-vs").text, gl.VERTEX_SHADER);
	var fragmentShader = glu.compileShader( document.getElementById("texture-shader-fs").text, gl.FRAGMENT_SHADER);
    //var vertexShader   = glu.compileShader( document.getElementById("edge-shader-vs").text, gl.VERTEX_SHADER);
	//var fragmentShader = glu.compileShader( document.getElementById("edge-shader-fs").text, gl.FRAGMENT_SHADER);
	this.shaderProgram  = glu.createProgram( vertexShader, fragmentShader);
	gl.useProgram(this.shaderProgram);   //    Install the program as part of the current rendering state

    //get location of variables in shader program (to later bind them to values);
	this.shaderProgram.vertexPosAttribLocation =   gl.getAttribLocation( this.shaderProgram, "vertexPosition"); 
	this.shaderProgram.texCoordAttribLocation =    gl.getAttribLocation( this.shaderProgram, "vertexTexCoords"); 
    this.shaderProgram.modelViewProjectionMatrixLocation =   gl.getUniformLocation(this.shaderProgram, "modelViewProjectionMatrix")
	this.shaderProgram.texLocation =               gl.getUniformLocation(this.shaderProgram, "tex");
    
    this.renderHierarchy(  );

}

MapLayer.MIN_ZOOM = 12; //experimentally tested: everything beyond level 12 is beyond the far plane
MapLayer.MAX_ZOOM = 19;


MapLayer.prototype.onTileLoaded = function()
{
    //var metatile = this;
    if (!gl) return;
    //console.log("loaded metatile for zoom level %s", metatile.zoom);
    //var gl = this.gl;


    this.numTilesLoaded +=1;
    //console.log("tile %s/%s loaded", this.numTilesLoaded, this.numTiles);
        
    if (this.onProgress)
        this.onProgress();
    //FIXME: add event for "texture load completed"
    
    //this.render();
}


MapLayer.prototype.renderQuad = function(vertices)
{
/*
    var vData = [].concat(vertices[0], vertices[1], vertices[2], vertices[3]);
    var vbo = glu.createArrayBuffer(vData);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);   
	gl.vertexAttribPointer(this.shaderProgram.vertexPosAttribLocation, 3, gl.FLOAT, false, 0, 0);
    
    gl.drawArrays(gl.LINE_LOOP, 0, 4);*/
    
}


function getMinDistanceFromOrigin(x1, x2, y1, y2) 
{
    var v1 = [ x1, y1, 0 ];
    var v2 = [ x2, y1, 0 ];
    var v3 = [ x2, y2, 0 ];
    var v4 = [ x1, y2, 0 ];

    var minDistance = Math.min( len3(v1), len3(v2), len3(v3), len3(v4));
    if (x1 * x2 < 0) //if x1 and x2 differ in sign, the closest point is not a vertex, but lies on an edge
        minDistance = Math.min(minDistance, Math.abs(y1), Math.abs(y2));
    
    if (y1 * y2 < 0)
        minDistance = Math.min(minDistance, Math.abs(x1), Math.abs(x2));
    
    // x1/x2 and y1/y2 differ in sign --> origin is contained in quad
    if (x1*x2 < 0 && y1*y2 < 0) 
        minDistance = 0;

    return minDistance;
}

MapLayer.prototype.renderRecursive = function(tileX, tileY, level, maxDistance, hasRenderedParent, tileListOut)
{
    var px = long2tile(position.lng,level);    
    var py = lat2tile( position.lat,level);

    var earthCircumference = 2 * Math.PI * (6378.1 * 1000);
    var physicalTileLength = earthCircumference* Math.cos(position.lat/180*Math.PI) / Math.pow(2, level);
    
    var x1 = (tileX - px)     * physicalTileLength;
    var x2 = (tileX - px + 1) * physicalTileLength;
    
    var y1 = (tileY - py) * physicalTileLength;
    var y2 = (tileY - py + 1) * physicalTileLength
    
    var v1 = [ x1, y1, 0 ];
    var v2 = [ x2, y1, 0 ];
    var v3 = [ x2, y2, 0 ];
    var v4 = [ x1, y2, 0 ];
    
    /*

    var pos = [0, 0, height];
    
    var angles = [openingAngle(pos, v1, v2),
                  //openingAngle(pos, v1, v3),
                  openingAngle(pos, v1, v4),
                  openingAngle(pos, v2, v3),
                  //openingAngle(pos, v2, v4),
                  openingAngle(pos, v3, v4)];
    
    //console.log(angles);
    var minPixels = Math.min.apply(null, angles)/45*600;
    var maxPixels = Math.max.apply(null, angles)/45*600;
    //console.log(minPixels, maxPixels);

    //console.log(tile_x, tile_y, level, tileListOut);*/
    //if (minPixels < 256)
    var minDistance = getMinDistanceFromOrigin(x1, x2, y1, y2);
    //console.log("minDistance at tile (%s, %s)/%s is %s; allowed is %s", tileX, tileY, level, minDistance, maxDistance[level]);
    
    if (minDistance  < maxDistance[level] || !hasRenderedParent)
    {
        this.renderQuad( [v1, v2, v3, v4]);
        tileListOut.push( [[v1,v2,v3,v4], tileX, tileY, level]);

        if (level+1 < MapLayer.MAX_ZOOM)
        {
            this.renderRecursive( tileX*2,   tileY*2,   level + 1, maxDistance, true, tileListOut);
            this.renderRecursive( tileX*2+1, tileY*2,   level + 1, maxDistance, true, tileListOut);
            this.renderRecursive( tileX*2,   tileY*2+1, level + 1, maxDistance, true, tileListOut);
            this.renderRecursive( tileX*2+1, tileY*2+1, level + 1, maxDistance, true, tileListOut);
        }
    }
    
}

function getRadius(pixelLength, height)
{
    //assumptions:  
    var vFOV = 45 /180 * Math.PI; // vertical FOV is 45°
    var vView = 768; // vertical viewport size is ~ 1000px on screen --> full sphere (360°) would be ~8000px
    var vCircle = 2*Math.PI /vFOV * vView; //length of circumference of a circle/sphere centered at the eye position in screen pixels
    //console.log("circle size: %s", vCircle);

    var anglePerPixel = vFOV/vView; // angle per pixel
    //anglePerPixel *= 2; //require more detail once tiles would be magnified by more than a factor of 2.0 during rendering;
    
    //console.log("target anglePerPixel: >%s°, metersPerPixel: %s", anglePerPixel/Math.PI*180, pixelLength);
    
    
    //initial test: for high camera positions, tiles would be too small already at radius 0.0
    var alpha = Math.atan(pixelLength/height);
    //console.log("angle for radius zero: %s°", alpha/Math.PI*180);
    if (alpha < anglePerPixel)
        return 0;
    
    
    var minR = 0;
    var maxR = 100000;
    
    for (var i = 0; i < 100; i++)
    {
        var midR = (minR + maxR) / 2.0;
        
        var edge1 = Math.sqrt( height*height + midR*midR);
        var edge2 = Math.sqrt( height*height + (midR+pixelLength)*(midR+pixelLength) );
        var cosAlpha = -(pixelLength*pixelLength - edge1*edge1 - edge2*edge2)/(2*edge1*edge2); //law of cosines
        //console.log("edge1: %sm, edge2: %sm, cosAlpha: %s", edge1, edge2, cosAlpha);
        // computation of cosAlpha is numerically unstable, may compute values slightly above 1.0.
        // this would result in a cosAlpha of NaN, which screws up comparisons to that value
        if (cosAlpha > 1.0) 
            cosAlpha = 1.0;
            
        var alpha = Math.acos(cosAlpha);
        //console.log("pixel angle at distance %s is %s", midR, alpha/Math.PI * 180);
        //console.log("");
        
        if (alpha < anglePerPixel)
            maxR = midR;
        else
            minR = midR;
        //return;
    }
    
    return midR;
}


MapLayer.prototype.renderHierarchy = function()
{
    var height = eye[2];
    var earthCircumference = 2 * Math.PI * (6378.1 * 1000);
    var physicalTileLength = earthCircumference* Math.cos(position.lat/180*Math.PI) / Math.pow(2, 17);
    var pixelLength = physicalTileLength / 256;
    
    //getRadius(pixelLength, 20);
    //return;
    
    var maxDistance = {};
    
    for (var level = 0; level < 25; level++)
    {
        var physicalTileLength = earthCircumference* Math.cos(position.lat/180*Math.PI) / Math.pow(2, level);
        var pixelLength = physicalTileLength / 256;
        maxDistance[level] = getRadius(pixelLength, height);
        //console.log("Require zoom level > %s for all tiles closer that %s to the origin.", level, maxDistance[level]);
    }
    //getRadius(pixelLength, eye[2]);

    /*var vertices = [[-1000, -1000, 5],[-1000, 1000, 5],[1000, 1000, 5],[1000, -1000, 5]];
    this.renderQuad(vertices);    */

    var x = Math.floor(long2tile(position.lng,12));
    var y = Math.floor(lat2tile( position.lat,12));
    
    //MapLayer.numTiles = 0;
    var tileList = [];
    this.renderRecursive(x+1, y-1, 12, maxDistance, false, tileList);
    this.renderRecursive(x  , y-1, 12, maxDistance, false, tileList);
    this.renderRecursive(x-1, y-1, 12, maxDistance, false, tileList);

    this.renderRecursive(x+1, y,   12, maxDistance, false, tileList);
    this.renderRecursive(x  , y,   12, maxDistance, false, tileList);
    this.renderRecursive(x-1, y,   12, maxDistance, false, tileList);

    this.renderRecursive(x+1, y+1, 12, maxDistance, false, tileList);
    this.renderRecursive(x  , y+1, 12, maxDistance, false, tileList);
    this.renderRecursive(x-1, y+1, 12, maxDistance, false, tileList);


    //tileList.sort( function(a,b) {return a[3] - b[3];});
    console.log("map layer consists of %s tiles:", tileList.length);
    this.tiles = [];
    for (var i in tileList)
        this.tiles.push(new Tile(tileList[i][1], tileList[i][2], tileList[i][3], this.shaderProgram, this ));
    //this.tile = new Tile( tileList[0][1], tileList[0][2], tileList[0][3], this.shaderProgram);
    /*for (var i in tileList)
        console.log(tileList[i]);*/
}

MapLayer.prototype.render = function(modelViewMatrix, projectionMatrix) 
{
    for (var i in this.tiles)
        this.tiles[i].render(modelViewMatrix, projectionMatrix);
    //this.tiles[0].render(modelViewMatrix, projectionMatrix);
/*
    var gl = this.gl;
    
	gl.useProgram(this.shaderProgram);   //    Install the program as part of the current rendering state
	gl.enableVertexAttribArray(this.shaderProgram.vertexPosAttribLocation); // setup vertex coordinate buffer
	gl.enableVertexAttribArray(this.shaderProgram.texCoordAttribLocation); //setup texcoord buffer

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(this.shaderProgram.vertexPosAttribLocation, 3, this.gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
	//gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoords);
	//gl.vertexAttribPointer(this.shaderProgram.texCoordAttribLocation, 2, this.gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"

    gl.uniform1i(this.shaderProgram.texLocation, 0); //select texture unit 0 as the source for the shader variable "tex" 
    
    var mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, projectionMatrix, modelViewMatrix);
	gl.uniformMatrix4fv(this.shaderProgram.modelViewProjectionMatrixLocation, false, mvpMatrix);
    //gl.uniformMatrix4fv(this.shaderProgram.perspectiveMatrixLocation, false, projectionMatrix);


    gl.enable(gl.POLYGON_OFFSET_FILL);  //to prevent z-fighting between rendered edges and faces
    gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0
    //console.log("rendering %s tiles", this.numTiles);
    for (var i = 0; i < this.numTiles; i++)
    {
        
        gl.polygonOffset(this.MAX_ZOOM-i+1,this.MAX_ZOOM-i+1);
        this.renderHierarchy(  );
        //gl.bindTexture(gl.TEXTURE_2D, this.textures[this.MIN_ZOOM + i]); //render geometry using texture "texture[i]" in texture unit 0
	    //gl.drawArrays(gl.LINE_LOOP, i*6, 6);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);*/
}
