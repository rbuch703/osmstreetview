
function long2tile(lon,zoom) { return ((lon+180)/360*Math.pow(2,zoom)); }
function lat2tile(lat,zoom)  { return ((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)); }

function tile2long(x,z) { return (x/Math.pow(2,z)*360-180); }
function tile2lat(y,z) { 
var n=Math.PI-2*Math.PI*y/Math.pow(2,z);
return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))));
}


/* Objects of this type get geo-coordinates (a lat/lng-pair) and zoom level passed, 
 * and create a 512x512pixels image centered on these coordinates

*/
function MetaTile( latlng, zoom) 
{

    this.zoom = zoom;
    
    // (fractional) tile coordinates of the requested point
    this.x = long2tile(latlng.lng,zoom);
    this.y = lat2tile( latlng.lat,zoom);

    // integer coordinates (corresponding to the tile file names) of the requested point
    this.tile_x = Math.floor(this.x);
    this.tile_y = Math.floor(this.y);

    //request tiles that make up this image
    this.tl = this.createSubImage( this.tile_x-1, this.tile_y-1, zoom);
    this.t  = this.createSubImage( this.tile_x,   this.tile_y-1, zoom);
    this.tr = this.createSubImage( this.tile_x+1, this.tile_y-1, zoom);
    this.l  = this.createSubImage( this.tile_x-1, this.tile_y  , zoom);
    this.c  = this.createSubImage( this.tile_x,   this.tile_y  , zoom);
    this.r  = this.createSubImage( this.tile_x+1, this.tile_y  , zoom);
    this.bl = this.createSubImage( this.tile_x-1, this.tile_y+1, zoom);
    this.b  = this.createSubImage( this.tile_x,   this.tile_y+1, zoom);
    this.br = this.createSubImage( this.tile_x+1, this.tile_y+1, zoom);
    
}

MetaTile.prototype.onImageLoad = function(e)
{ 
    var metatile = this.metatile;
    metatile.numLoaded+= 1; 
    //console.log("now loaded %s sub-tiles", metatile.numLoaded); 
    if (metatile.numLoaded >= 9)
    {
        //all sub-tiles were loaded successfully; now paste them together
    	var canvas = document.createElement("CANVAS");
	    canvas.width = 256*3;
    	canvas.height = 256*3;
    	var ctx = canvas.getContext("2d")
    	
    	ctx.drawImage(metatile.tl, 256*0, 256*0);
    	ctx.drawImage(metatile.t,  256*1, 256*0);
    	ctx.drawImage(metatile.tr, 256*2, 256*0);
    	
    	ctx.drawImage(metatile.l,  256*0, 256*1);
    	ctx.drawImage(metatile.c,  256*1, 256*1);
    	ctx.drawImage(metatile.r,  256*2, 256*1);

    	ctx.drawImage(metatile.bl, 256*0, 256*2);
    	ctx.drawImage(metatile.b,  256*1, 256*2);
    	ctx.drawImage(metatile.br, 256*2, 256*2);

        var canvas2 = document.createElement("CANVAS");
	    canvas2.width = 256*2;
    	canvas2.height = 256*2;
    	var px = Math.round((metatile.x - Math.floor(metatile.x))*256);
    	var py = Math.round((metatile.y - Math.floor(metatile.y))*256);
    	//console.log("px/py: (%s,%s)", px, py);
        canvas2.getContext("2d").drawImage(canvas, px, py, 512, 512, 0, 0, 512, 512);
        
        metatile.img = new Image();
        metatile.img.src = canvas2.toDataURL("image/png");
        //console.log("Image is ", metatile.src);

        if (metatile.onload)    //call user-defined event handler
            metatile.onload(this.metatile);
    }
}

MetaTile.prototype.createSubImage = function(x, y, zoom)
{
    var im = new Image();
    im.metatile = this;
    im.crossOrigin = "anonymous";   //required to get CORS approval, and thus to be able create another image from this one (which we will do with toDataURL() )
    im.onload = this.onImageLoad;
    im.src = MetaTile.basePath + zoom + "/" + x + "/" + y + ".png";
    return im;
}


MetaTile.prototype.numLoaded = 0;//.test = function() { alert('OK'); } // OK
MetaTile.basePath = "http://tile.openstreetmap.org/";   // attached to the constructor to be shared globally
//MetaTile.basePath = "http://ipsum4.rbuch703.de/osm/";   // attached to the constructor to be shared globally


