"use strict"

/* Copyright (c) 2014, Robert Buchholz <rbuch703@gmail.com> 
   The contents of this file are licensed under the GNU General Public License version 3
   (see the LICENSE file in the project root for details)
*/

/**
 * @constructor
 */
function MapLayer(tileSet, position) {

    if (tileSet === undefined)
        tileSet = MapLayer.TileSets.OSM
    this.createTileHierarchy( tileSet, position);

}

//MapLayer.MIN_ZOOM = 12; //experimentally tested: everything beyond level 12 is beyond the far plane
//MapLayer.MAX_ZOOM = 19;

MapLayer.TileSets = { 
    OSM:              { baseUrl:"http://{s}.tile.openstreetmap.org/",       fileExtension: "png", tileSize:256, minZoom:0, maxZoom:19 },
    MapQuestOpen:     { baseUrl:"http://otile1.mqcdn.com/tiles/1.0.0/map/", fileExtension: "jpg", tileSize:256, minZoom:0, maxZoom:19 },
    //same tile URL for US and non-US satellite imagery, but only the US is covered down to zoom level 18
    MapQuestOpenSat:  { baseUrl:"http://otile1.mqcdn.com/tiles/1.0.0/sat/", fileExtension: "jpg", tileSize:256, minZoom:0, maxZoom:11 },
    MapQuestOpenSatUS:{ baseUrl:"http://otile1.mqcdn.com/tiles/1.0.0/sat/", fileExtension: "jpg", tileSize:256, minZoom:0, maxZoom:18 },
    OsmBrightMagdeburg:{ baseUrl:"http://{s}.tile.rbuch703.de/tiles/map/",  fileExtension: "png", tileSize:512, minZoom:0, maxZoom:19 }
}

MapLayer.prototype.createTilesRecursive = function(tileX, tileY, level, position, maxDistance, hasRenderedParent, tileSet, tileListOut)
{
    var px = long2tile(position.lng,level);    
    var py = lat2tile( position.lat,level);

    var physicalTileLength = Helpers.getEarthCircumference() * Math.cos(position.lat/180*Math.PI) / Math.pow(2, level);
    
    var x1 = (tileX - px)     * physicalTileLength;
    var x2 = (tileX - px + 1) * physicalTileLength;
    
    var y1 = (tileY - py) * physicalTileLength;
    var y2 = (tileY - py + 1) * physicalTileLength
    
    /*var v1 = [ x1, y1, 0 ];
    var v2 = [ x2, y1, 0 ];
    var v3 = [ x2, y2, 0 ];
    var v4 = [ x1, y2, 0 ];*/
    
    var minDistance = getMinDistanceFromOrigin(x1, x2, y1, y2);

    if (minDistance  < maxDistance[level] || !hasRenderedParent)
    {
    
        tileListOut.push( {/*vertices:[v1,v2,v3,v4], */tileX:tileX, tileY:tileY, zoomLevel:level} );

        if (level < tileSet.maxZoom)
        {
            this.createTilesRecursive( tileX*2,   tileY*2,   level + 1, position, maxDistance, true, tileSet, tileListOut);
            this.createTilesRecursive( tileX*2+1, tileY*2,   level + 1, position, maxDistance, true, tileSet, tileListOut);
            this.createTilesRecursive( tileX*2,   tileY*2+1, level + 1, position, maxDistance, true, tileSet, tileListOut);
            this.createTilesRecursive( tileX*2+1, tileY*2+1, level + 1, position, maxDistance, true, tileSet, tileListOut);
        }
    }
    
}


// returns the angle alpha between edge1 and edge2
function getViewAngle(height, distance, delta)
{
   /* x - Eye                _
     * |\_                    |
     * | \\_                  h
     * |  \ \_                e
     * |   \  \_              i
     * |    \-e1\_            g
     * |     \    \_-e2       h
     * |      \     \_        t
     * |_______\______\       _
     * |-dist- |
     * |-dist + delta-|       */
     
    var edge1 = Math.sqrt( height*height + distance*distance);
    var edge2 = Math.sqrt( height*height + Math.pow(distance+delta,2) );
    var cosAlpha = -(delta*delta - edge1*edge1 - edge2*edge2)/(2*edge1*edge2); //law of cosines

    // computation of cosAlpha is numerically unstable, may compute values slightly above 1.0.
    // this would result in a alpha of NaN, which screws up comparisons to that value
    if (cosAlpha > 1.0)
        cosAlpha = 1.0;
        
    return Math.acos(cosAlpha);
}

/* computes the distance (in [m]) at which a single texture pixel of the ground layer would cover less than a single screen pixel.
   That is (approximately) the distance at which a texture will no longer be rendered at full resolution, and thus the distance
   at which a lower-resolution texture would suffice */
function getMipmapDistance(pixelLength /*in [m/px]*/, height /*in [m] */)
{
    //assumptions:  
    var vFOV = 45 /180 * Math.PI; // vertical FOV is 45°
    var vView = 768; // vertical viewport size is ~ 768px on screen --> full sphere (360°) would be ~8000px
    var vCircle = 2*Math.PI /vFOV * vView; //pixel length of circumference of a circle/sphere centered at the eye position in screen pixels

    var anglePerPixel = vFOV/vView; // the corresponding view angle at which a single texture pixel would cover less than a single screen pixel
    
    
    //early termination: for high camera positions, tiles would be too small already at radius 0.0
    var alpha = Math.atan(pixelLength/height);
    if (alpha < anglePerPixel)
        return 0;
    
    
    var minR = 0;
    var maxR = 100000;
    
    /* It is too complicated to determine the mipmap distance directly. But it is relatively easy to compute whether
       a given distance is before or after the mipmap distance (or, equivalently, whether the view angle of a single
       texture pixel at a given distance is smaller than the view angle of a single screen pixel). And since the function
       of view angle depending on view distane is strictly monotonous, we can use an iterative midpoint bisection approach
       on that function to approximate the mipmap distance.*/
    for (var i = 0; i < 100; i++)
    {
        var midR = (minR + maxR) / 2.0;
 
        alpha = getViewAngle(height, midR, pixelLength);
        
        if (alpha < anglePerPixel)
            maxR = midR;
        else
            minR = midR;
    }
    
    return midR;
}

MapLayer.prototype.updateTileGeometry = function(position)
{
    for (var i in this.tiles)
    {
        var tile = this.tiles[i];
        tile.updateGeometry( position );
    }
}

MapLayer.prototype.createTileHierarchy = function(tileSet, position)
{

    if (tileSet != this.activeTileSet)
    {   //cannot recycle any tiles
        for (var i in this.tiles)
        {
            this.tiles[i].free();   //deletes attached gl objects (vertex buffers, texture)
            delete this.tiles[i];
        }
    }

    this.activeTileSet = tileSet;

    //experimentally tested: everything beyond level 12 is beyond the far plane
    var MIN_ZOOM = 12;
    
    if (MIN_ZOOM < tileSet.minZoom)
        MIN_ZOOM = tileSet.minZoom;
    if (MIN_ZOOM > tileSet.maxZoom)
        MIN_ZOOM = tileSet.maxZoom;
        

    var mipmapDistance = {};
    
    for (var level = MIN_ZOOM; level <= tileSet.maxZoom; level++)
    {
        var physicalTileLength = Helpers.getEarthCircumference() * Math.cos(position.lat/180*Math.PI) / Math.pow(2, level);
        var pixelLength = physicalTileLength / tileSet.tileSize;    //in [m/pixel]
        mipmapDistance[level] = getMipmapDistance(pixelLength, position.height);
    }

    var x = Math.floor(long2tile(position.lng, MIN_ZOOM ));
    var y = Math.floor(lat2tile( position.lat, MIN_ZOOM ));
    
    var listX = [-1, 0, 1];
    var listY = [-1, 0, 1];
    
    var tileList = [];
    for (var i in listX)
        for (var j in listY)
            this.createTilesRecursive(x+listX[i], y+listY[j], MIN_ZOOM, position, mipmapDistance, false, tileSet, tileList);  
    
    tileList.sort( function(a, b) { return a.zoomLevel - b.zoomLevel; } );

    var tileIds = {};
    for (var i in tileList)
        tileIds[ [tileList[i].tileX, tileList[i].tileY, tileList[i].zoomLevel] ] = tileList[i];
        
    
    if (this.tiles === undefined)
        this.tiles = {};
    
    for (var i in this.tiles)
    {
        var tile = this.tiles[i]

        if ( ! ([tile.x, tile.y, tile.level] in tileIds))
        {
            //console.log("removing obsolete tile %o", tile)
            this.tiles[i].free();   //delete attached gl objects (vertex buffers, texture)
            delete this.tiles[i];
        } else
        {
            //console.log("keeping tile %o", tile);
        }
    }
    
    //console.log("new map layer consists of %s tiles, %s of which are recycled", tileList.length, Object.keys(this.tiles).length);

    
    for (var i in tileList)
    {
        var tileId = [tileList[i].tileX, tileList[i].tileY, tileList[i].zoomLevel];
        if (! (tileId in this.tiles))
            this.tiles[ tileId] = new Tile(tileList[i].tileX, tileList[i].tileY, tileList[i].zoomLevel, this, tileSet );
    }
}

MapLayer.prototype.render = function(modelViewMatrix, projectionMatrix) 
{
    for (var i in this.tiles)
        this.tiles[i].render(modelViewMatrix, projectionMatrix);
}
