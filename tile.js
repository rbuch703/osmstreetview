"use strict"

function Tile( tileX, tileY, level, shaderProgram, mapLayer) 
{

    this.level = level;
    this.x = tileX;
    this.y = tileY;
    this.shaderProgram = shaderProgram;
    this.texId = null;
    this.mapLayer = mapLayer;
    
        
    var im = new Image();
    //required to get CORS approval, and thus to be able to draw this on a canvas without tainting that
    im.tile = this;
    im.crossOrigin = "anonymous";   
    im.onload = this.onImageLoaded;
    im.src = Tile.basePath + level + "/" + this.x + "/" + this.y + "." + Tile.fileExtension;
    this.image = im;    
    
    
    var px = long2tile(Controller.position.lng,level);
    var py = lat2tile( Controller.position.lat,level);

    var earthCircumference = 2 * Math.PI * (6378.1 * 1000);
    var physicalTileLength = earthCircumference* Math.cos(Controller.position.lat/180*Math.PI) / Math.pow(2, level);
    
    var x1 = (this.x - px)     * physicalTileLength;
    var x2 = (this.x - px + 1) * physicalTileLength;
    
    var y1 = (this.y - py) * physicalTileLength;
    var y2 = (this.y - py + 1) * physicalTileLength
    
    var v1 = [ x1, y1, 0 ];
    var v2 = [ x2, y1, 0 ];
    var v3 = [ x2, y2, 0 ];
    var v4 = [ x1, y2, 0 ];

    var vertexData = v1.concat(v4, v3, v2);
    this.vertices =  glu.createArrayBuffer(vertexData);
    this.texCoords = glu.createArrayBuffer([0,0,  0,1,  1,1,  1,0]);
    
    
    
}

Tile.prototype.render = function(modelViewMatrix, projectionMatrix) 
{
    //texture is not yet ready --> cannot render
    if (this.texId === null)
        return;
    
	gl.useProgram(this.shaderProgram);   //    Install the program as part of the current rendering state
	gl.enableVertexAttribArray(this.shaderProgram.locations.vertexPos); // setup vertex coordinate buffer
	gl.enableVertexAttribArray(this.shaderProgram.locations.texCoord); //setup texcoord buffer

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(this.shaderProgram.locations.vertexPos, 3, gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
	gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoords);
	gl.vertexAttribPointer(this.shaderProgram.locations.vertexTexCoords, 2, gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"*/

    gl.uniform1i(this.shaderProgram.locations.tex, 0); //select texture unit 0 as the source for the shader variable "tex" 
    
    var mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, projectionMatrix, modelViewMatrix);
	gl.uniformMatrix4fv(this.shaderProgram.locations.modelViewProjectionMatrix, false, mvpMatrix);

    gl.enable(gl.POLYGON_OFFSET_FILL);  //to prevent z-fighting between rendered edges and faces
    gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0

    gl.polygonOffset(MapLayer.MAX_ZOOM - this.level + 1, MapLayer.MAX_ZOOM - this.level + 1);

    gl.bindTexture(gl.TEXTURE_2D, this.texId); //render geometry using texture "tex" in texture unit 0
	gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    gl.disable(gl.POLYGON_OFFSET_FILL);
}

Tile.prototype.onImageLoaded = function(e)
{ 
    var tile = this.tile;

    tile.texId = glu.createTexture(this);
    delete tile.image;
    
    if (tile.mapLayer.onProgress)    //call user-defined event handler
        tile.mapLayer.onProgress();
}


//Tile.basePath = "http://tile.openstreetmap.org/";   // attached to the constructor to be shared globally
Tile.basePath = "http://tile.rbuch703.de/osm/";
Tile.fileExtension = "png";

//Tile.basePath = "http://otile1.mqcdn.com/tiles/1.0.0/sat/";   // attached to the constructor to be shared globally
//Tile.fileExtension = "jpg";

//Tile.basePath = "http://ipsum4.rbuch703.de/osm/";   // attached to the constructor to be shared globally


