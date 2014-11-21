"use strict"

/* Copyright (c) 2014, Robert Buchholz <rbuch703@gmail.com> 
   The contents of this file are licensed under the GNU General Public License version 3
   (see the LICENSE file in the project root for details)
*/

/**
 * @constructor
 */
function Tile( tileX, tileY, level, mapLayer, tileSet) 
{

    this.level = level;
    this.x = tileX;
    this.y = tileY;
    this.texId = null;
    this.mapLayer = mapLayer;
    
        
    var im = new Image();
    im.tile = this;
    //required to get CORS approval, and thus to be able to draw this on a canvas without tainting that
    im.crossOrigin = "anonymous";   
    im.onload = this.onImageLoaded;
    
    var servers = ["a", "b", "c"];
    
    var idx = Math.floor(Math.random()* servers.length);
    
    im.src = tileSet.baseUrl.replace("{s}", servers[idx]) + level + "/" + this.x + "/" + this.y + "." + tileSet.fileExtension;
    this.image = im;    
    
    this.updateGeometry(Controller.position);
}

Tile.prototype.updateGeometry = function(position)
{
    var px = long2tile(position.lng,this.level);
    var py = lat2tile( position.lat,this.level);

    var physicalTileLength = Helpers.getEarthCircumference()* Math.cos(position.lat/180*Math.PI) / Math.pow(2, this.level);
    
    var x1 = (this.x - px)     * physicalTileLength;
    var x2 = (this.x - px + 1) * physicalTileLength;
    
    var y1 = (this.y - py) * physicalTileLength;
    var y2 = (this.y - py + 1) * physicalTileLength
    
    var v1 = [ x1, y1, 0 ];
    var v2 = [ x2, y1, 0 ];
    var v3 = [ x2, y2, 0 ];
    var v4 = [ x1, y2, 0 ];

    var vertexData = [].concat(v1, v4, v3, v1, v3, v2);
    if (this.vertices)
        gl.deleteBuffer(this.vertices);
    if (this.texCoords)
        gl.deleteBuffer(this.texCoords);
        
    this.vertices =  glu.createArrayBuffer(vertexData);
    this.texCoords = glu.createArrayBuffer([0,0,  0,1,  1,1,  0,0,  1,1,  1,0]);

}

Tile.prototype.free = function()
{
    gl.deleteBuffer(this.vertices);
    gl.deleteBuffer(this.texCoords);
    gl.deleteTexture(this.texId);
}

Tile.prototype.render = function(modelViewMatrix, projectionMatrix) 
{
    //texture is not yet ready --> cannot render
    if (this.texId === null || !Shaders.ready)
        return;
    
	gl.useProgram(Shaders.textured);   //    Install the program as part of the current rendering state
	glu.enableVertexAttribArrays(Shaders.textured);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(Shaders.textured.locations.vertexPosition, 3, gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
	gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoords);
	gl.vertexAttribPointer(Shaders.textured.locations.vertexTexCoords, 2, gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"*/

    gl.uniform1i(Shaders.textured.locations.tex, 0); //select texture unit 0 as the source for the shader variable "tex" 
    
    var mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, projectionMatrix, modelViewMatrix);
	gl.uniformMatrix4fv(Shaders.textured.locations.modelViewProjectionMatrix, false, mvpMatrix);

    gl.enable(gl.POLYGON_OFFSET_FILL);  //to prevent z-fighting between rendered edges and faces
    gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0

    gl.polygonOffset(mapPlane.activeTileSet.maxZoom - this.level + 1, mapPlane.activeTileSet.maxZoom - this.level + 1);

    gl.bindTexture(gl.TEXTURE_2D, this.texId); //render geometry using texture "tex" in texture unit 0
	gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.POLYGON_OFFSET_FILL);

	glu.disableVertexAttribArrays(Shaders.textured); 
}

Tile.prototype.onImageLoaded = function(e)
{ 
    var tile = this.tile;

    tile.texId = glu.createTexture(this);
    delete tile.image;
    
    if (tile.mapLayer.onProgress)    //call user-defined event handler
        tile.mapLayer.onProgress();
}

