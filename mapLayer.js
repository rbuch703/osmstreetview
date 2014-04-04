
function MapLayer(gl, position) {
    console.log("MapLayer created");
    this.gl = gl;
    // request OSM tiles for texturing
    //var map = this;

    this.MIN_ZOOM = 13;
    this.MAX_ZOOM = 19;

    for (var zoom = this.MIN_ZOOM; zoom <= this.MAX_ZOOM; zoom++)
    {
        this.createTile(position, zoom);
    }
    
    //construct geometry (including texture coordinates) to render the tiles on
    var geometry = [];
    var tc = [];
    var tcPerTile = [0,0, 1,0, 1,1, 0,0, 1,1, 0,1];
    for (var zoom = this.MIN_ZOOM; zoom <= this.MAX_ZOOM; zoom++)
    {
        // formulas taken from http://wiki.openstreetmap.org/wiki/Zoom_levels 
        var earthCircumference = 2 * Math.PI * (6378.1 * 1000);
        var physicalTileLength = earthCircumference* Math.cos(position.lat/180*Math.PI) / Math.pow(2, zoom);
        
        var halfWidth = 0.5 * physicalTileLength;
        //tile rectangle, specified as two triangles
        geometry = geometry.concat([-halfWidth, -halfWidth, zoom/100,
                                     halfWidth, -halfWidth, zoom/100,
                                     halfWidth,  halfWidth, zoom/100,
                                    -halfWidth, -halfWidth, zoom/100,
                                     halfWidth,  halfWidth, zoom/100,
                                    -halfWidth,  halfWidth, zoom/100]);
        tc = tc.concat(tcPerTile);
    }
    
    
    this.vertices = glu.createArrayBuffer(geometry);
    this.texCoords=glu.createArrayBuffer(tc);
    this.textures = [];
    this.numTiles = geometry.length/(3*6); //six vertices per tile, three coordinates per vertex
    this.numTilesLoaded = 0;
}

MapLayer.prototype.createTile = function(position, zoom)
{
    var tile = new MetaTile(position, zoom);
    //console.log("me: %o, my function: %o", this, this.onMetaTileLoaded);
    
    var mapLayer = this;    //HACK: cannot just use "this" inside the next function, because there "this" would be bound to "tile"
    tile.onload = function() {
        //console.log("now handling event for %o", mapLayer);
        mapLayer.onMetaTileLoaded(tile, gl);
    }
    return tile;
}

MapLayer.prototype.onMetaTileLoaded = function(metatile)
{
    //var metatile = this;
    var gl = this.gl;
    //console.log("loaded metatile for zoom level %s", metatile.zoom);
    //var gl = this.gl;

    var tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
            
    gl.bindTexture(gl.TEXTURE_2D, tex);
    //console.log("now loading texture %o of tile %o", metatile.canvas, metatile);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, metatile.canvas); //load texture data
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);                  //set zoom-in filter to linear interpolation
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);    //set zoom-out filter to linear interpolation between pixels and mipmap levels
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // texCords are clamped 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // to range [0..1]
    gl.generateMipmap(gl.TEXTURE_2D);                                     // automatic mipmap generation
    
    // enable anisotropic filtering for this texture of available.
    // without anisotrophy, textures on triangles close to parallel to the view direction
    // would appear extremely blurry
    var ext = gl.getExtension("EXT_texture_filter_anisotropic"); //check for anisotropy support
    if (ext)
    {
        var max_anisotropy = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
        gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, max_anisotropy);
    }

    this.textures[metatile.zoom] = tex;

    this.numTilesLoaded +=1;
    //console.log("tile %s/%s loaded", this.numTilesLoaded, this.numTiles);
    if ((this.numTilesLoaded == this.numTiles) && (this.onLoaded))
        this.onLoaded();
        
    if ((this.numTilesLoaded != this.numTiles) && (this.onProgress))
        this.onProgress();
    //FIXME: add event for "texture load completed"
    
    //this.render();
}

MapLayer.prototype.render = function() 
{
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(shaderProgram.vertexPosAttribLocation, 3, this.gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
	gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoords);
	gl.vertexAttribPointer(shaderProgram.texCoordAttribLocation, 2, this.gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"


    gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0
    for (var i = 0; i < this.numTiles; i++)
    {
        gl.bindTexture(gl.TEXTURE_2D, this.textures[this.MIN_ZOOM + i]); //render geometry using texture "texture[i]" in texture unit 0
	    gl.drawArrays(gl.TRIANGLES, i*6, 6);
    }
}
