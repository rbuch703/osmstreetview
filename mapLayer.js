"use strict"

/* Copyright (c) 2014, Robert Buchholz <rbuch703@gmail.com> 
   The contents of this file are licensed under the GNU General Public License version 3
   (see the LICENSE file in the project root for details)
*/

/**
 * @constructor
 */
function MapLayer(tileSet) {

    if (tileSet === undefined)
    tileSet = MapLayer.TileSets.OSM
    this.createTileHierarchy( tileSet );

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

MapLayer.prototype.createTilesRecursive = function(tileX, tileY, level, maxDistance, hasRenderedParent, tileSet, tileListOut)
{
    var px = long2tile(Controller.position.lng,level);    
    var py = lat2tile( Controller.position.lat,level);

    var earthCircumference = 2 * Math.PI * (6378.1 * 1000);
    var physicalTileLength = earthCircumference* Math.cos(Controller.position.lat/180*Math.PI) / Math.pow(2, level);
    
    var x1 = (tileX - px)     * physicalTileLength;
    var x2 = (tileX - px + 1) * physicalTileLength;
    
    var y1 = (tileY - py) * physicalTileLength;
    var y2 = (tileY - py + 1) * physicalTileLength
    
    var v1 = [ x1, y1, 0 ];
    var v2 = [ x2, y1, 0 ];
    var v3 = [ x2, y2, 0 ];
    var v4 = [ x1, y2, 0 ];
    
    var minDistance = getMinDistanceFromOrigin(x1, x2, y1, y2);

    if (minDistance  < maxDistance[level] || !hasRenderedParent)
    {
        tileListOut.push( [[v1,v2,v3,v4], tileX, tileY, level]);

        if (level < tileSet.maxZoom)
        {
            this.createTilesRecursive( tileX*2,   tileY*2,   level + 1, maxDistance, true, tileSet, tileListOut);
            this.createTilesRecursive( tileX*2+1, tileY*2,   level + 1, maxDistance, true, tileSet, tileListOut);
            this.createTilesRecursive( tileX*2,   tileY*2+1, level + 1, maxDistance, true, tileSet, tileListOut);
            this.createTilesRecursive( tileX*2+1, tileY*2+1, level + 1, maxDistance, true, tileSet, tileListOut);
        }
    }
    
}

function getRadius(pixelLength, height)
{
    //assumptions:  
    var vFOV = 45 /180 * Math.PI; // vertical FOV is 45°
    var vView = 768; // vertical viewport size is ~ 768px on screen --> full sphere (360°) would be ~8000px
    var vCircle = 2*Math.PI /vFOV * vView; //length of circumference of a circle/sphere centered at the eye position in screen pixels

    var anglePerPixel = vFOV/vView; // angle per pixel
    
    
    //initial test: for high camera positions, tiles would be too small already at radius 0.0
    var alpha = Math.atan(pixelLength/height);
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

        // computation of cosAlpha is numerically unstable, may compute values slightly above 1.0.
        // this would result in a alpha of NaN, which screws up comparisons to that value
        if (cosAlpha > 1.0) 
            cosAlpha = 1.0;
            
        var alpha = Math.acos(cosAlpha);

        if (alpha < anglePerPixel)
            maxR = midR;
        else
            minR = midR;
    }
    
    return midR;
}


MapLayer.prototype.createTileHierarchy = function(tileSet)
{
    this.activeTileSet = tileSet;

    //experimentally tested: everything beyond level 12 is beyond the far plane
    var MIN_ZOOM = 12;
    
    if (MIN_ZOOM < tileSet.minZoom)
        MIN_ZOOM = tileSet.minZoom;
    if (MIN_ZOOM > tileSet.maxZoom)
        MIN_ZOOM = tileSet.maxZoom;
        

    var height = Controller.localPosition.z;
    var earthCircumference = 2 * Math.PI * (6378.1 * 1000);
    //var physicalTileLength = earthCircumference* Math.cos(Controller.position.lat/180*Math.PI) / Math.pow(2, 17);
    //var pixelLength = physicalTileLength / tileSet.tileSize;
    
    var maxDistance = {};
    
    for (var level = 0; level < 25; level++)
    {
        var physicalTileLength = earthCircumference* Math.cos(Controller.position.lat/180*Math.PI) / Math.pow(2, level);
        var pixelLength = physicalTileLength / tileSet.tileSize;
        maxDistance[level] = getRadius(pixelLength, height);
    }

    var x = Math.floor(long2tile(Controller.position.lng, MIN_ZOOM ));
    var y = Math.floor(lat2tile( Controller.position.lat, MIN_ZOOM ));
    
    var listX = [-1, 0, 1];
    var listY = [-1, 0, 1];
    
    var tileList = [];
    for (var i in listX)
        for (var j in listY)
            this.createTilesRecursive(x+listX[i], y+listY[j], MIN_ZOOM, maxDistance, false, tileSet, tileList);  
    
    tileList.sort( function(a, b) { return a[3] - b[3];});
    console.log("map layer consists of %s tiles", tileList.length);
    
    if (! this.tiles === undefined)
        for (var i in this.tiles)
            this.tiles[i].free();
    
    this.tiles = [];
    for (var i in tileList)
        this.tiles.push(new Tile(tileList[i][1], tileList[i][2], tileList[i][3], this, tileSet ));
}

MapLayer.prototype.render = function(modelViewMatrix, projectionMatrix) 
{
    for (var i in this.tiles)
        this.tiles[i].render(modelViewMatrix, projectionMatrix);
}
