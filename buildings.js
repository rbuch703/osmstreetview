function long2tile(lon,zoom) { return ((lon+180)/360*Math.pow(2,zoom)); }
function lat2tile(lat,zoom)  { return ((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)); }

function tile2long(x,z) { return (x/Math.pow(2,z)*360-180); }
function tile2lat(y,z) { 
    var n=Math.PI-2*Math.PI*y/Math.pow(2,z);
    return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))));
}


function Buildings(gl, position)
{

    this.gl = gl;
    this.mapCenter = position;//{lat:52.13850380245244, lng:11.64003610610962};

    var bldgs = this;
    var oReq = new XMLHttpRequest();
    oReq.onload = function() { bldgs.onDataLoaded(this); }
    oReq.open("get", "http://overpass-api.de/api/interpreter?data=%5Bout%3Ajson%5D%5Btimeout%3A25%5D%3Bway%5B%22building%22%5D%2852%2E1360%2C11%2E6356%2C52%2E1418%2C11%2E6416%29%3Bout%20body%3B%3E%3Bout%20skel%20qt%3B", true);
    oReq.send();
    /*QL query: <bbox-query e="11.6416" n="52.1418" s="52.1360" w="11.6356"/> */
    /*corresponding "get" string:  [out:json][timeout:25];way["building"](52.1360,11.6356,52.1418,11.6416);out body;>;out skel qt;; */
    
}    
    
    
Buildings.prototype.onDataLoaded = function(response) {
    var res = JSON.parse(response.responseText);
    console.log(res);
    var nodes = {};
    
    this.buildings = [];
    //step 1: read all nodes and make them searchable by their id
    for (var i = 0; i < res.elements.length; i++)
    {
        if (res.elements[i].type != "node")
            continue;
        var node = res.elements[i];
        nodes[node.id] = {lat:node.lat, lon:node.lon};
        //delete res.elements[i];
    }
    //console.log("Nodes : %o",nodes);
    
    //step 2: read all ways and replace their node IDs by the actual node data
    for (var i = 0; i < res.elements.length; i++)
    {
        if (res.elements[i].type != "way")
            continue;
            
        var way = res.elements[i];
        var building = { outline: [] };
        
        if (way.tags.height)
            building.height = way.tags.height;
        else if (way.tags["building:levels"])
            building.height = parseInt(way.tags["building:levels"])*3.5;
        
        for (var j = 0; j < way.nodes.length; j++)
        {
            var id = way.nodes[j];
            if (id in nodes)
                building.outline.push( nodes[id]);
            else
                console.log("[WARN] Way %o contains node %d, but server response does not include node data. Skipping.", way, id);
        }
        this.buildings.push(building);
    }
    
    
    //console.log("map center is lat/lng: %s%s; x/y: (%s,%s)", mapCenter.lat, mapCenter.lon , x, y);
    //console.log("Buildings set: %o", this);
    this.buildings = convertToLocalCoordinates(this.buildings, this.mapCenter);
    this.buildGlGeometry();
    
    if (this.onLoaded)
        this.onLoaded();
    
    //console.log("Buildings: %o", this.buildings);
}

Buildings.prototype.buildGlGeometry = function() {
    this.indices = [];
    this.lengths = [];
    this.vertices= [];
    this.texCoords=[];
    
    var pos = 0;
    for (var i in this.buildings)
    {
        var bldg = this.buildings[i];
        this.indices.push(pos);
        this.lengths.push( (bldg.outline.length-1)*6 );
        pos += (bldg.outline.length-1)*6;
        
        if (bldg.outline[0].dx != bldg.outline[bldg.outline.length-1].dx || bldg.outline[0].dy != bldg.outline[bldg.outline.length-1].dy)
            console.log("[WARN] buildigns outline does not form a closed loop");
        
        for (var j = 0; j < bldg.outline.length - 1; j++) //loop does not include the final vertex, as we in each case access the successor vertex as well
        {
            var height = bldg.height ? bldg.height : 10;
        
            var A = [bldg.outline[j  ].dx, bldg.outline[j  ].dy, 0];
            var B = [bldg.outline[j+1].dx, bldg.outline[j+1].dy, 0];
            var C = [bldg.outline[j+1].dx, bldg.outline[j+1].dy, height];
            var D = [bldg.outline[j  ].dx, bldg.outline[j  ].dy, height];
            
            /*this.vertices.push( bldg.outline[j].dx);
            this.vertices.push( bldg.outline[j].dy);
            this.vertices.push( 0.2); //FIXME: replace this z value by actual building height
            
            this.texCoords.push( Math.random());
            this.texCoords.push( Math.random());*/
            /* D-C
             * |/|
             * A-B
             */
            
            this.vertices = this.vertices.concat(A);
            this.vertices = this.vertices.concat(B);
            this.vertices = this.vertices.concat(C);
            this.vertices = this.vertices.concat(A);
            this.vertices = this.vertices.concat(C);
            this.vertices = this.vertices.concat(D);
            
            var tc = [0,0, 1,0, 1,1, 0,0, 1,1, 0,1];
            for (var k = 0; k < 6*2; k++)   //six vertices, each needs two texCoords
                this.texCoords.push(0.5);
            //this.texCoords = this.texCoords.concat(tc);
        }
    }
    
    console.log("total elements: %d vertex coordinates, %d texCoords", this.vertices.length, this.texCoords.length);
    this.vertices = glu.createArrayBuffer(this.vertices);
    this.texCoords= glu.createArrayBuffer(this.texCoords);
}

Buildings.prototype.render = function() {
    if (! this.lengths)
        return;
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(shaderProgram.vertexPosAttribLocation, 3, this.gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
	gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoords);
	gl.vertexAttribPointer(shaderProgram.texCoordAttribLocation, 2, this.gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"


    gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, null); //render geometry without texture
    gl.lineWidth(5.0);
    //console.log("starting rendering of buildings")

    for (var i in this.lengths)
    {
	    //gl.drawArrays(gl.LINE_LOOP, this.indices[i], this.lengths[i]);
        //console.log("rendering %d vertices starting from index %d", this.lengths[i], this.indices[i]);
	    
	    gl.drawArrays(gl.TRIANGLES, this.indices[i], this.lengths[i]);
	    //gl.drawArrays(gl.TRIANGLE_FAN, this.indices[i], this.lengths[i]);
    }

}


/* converts 'buildings' global coordinates (lat/lon) to local distances (in m) from mapCenter*/
function convertToLocalCoordinates(buildings,  mapCenter)
{
    var y0 = lat2tile(mapCenter.lat, 19);
    var x0 = long2tile(mapCenter.lng, 19);

    var earthCircumference = 2 * Math.PI * (6378.1 * 1000);
    //FIXME: find out why the final correction factor of 2.0 is necessary
    var physicalTileLength = earthCircumference* Math.cos(mapCenter.lat/180*Math.PI) / Math.pow(2, /*zoom=*/19) / 2.0;

    for (var i = 0; i < buildings.length; i++)
    {
        var bld = buildings[i];
        for (var j = 0; j < bld.outline.length; j++)
        {
            var y = lat2tile(bld.outline[j].lat, 19);
            var x = long2tile(bld.outline[j].lon, 19);
            
            bld.outline[j].dx = (x - x0) * physicalTileLength;
            bld.outline[j].dy = (y - y0) * physicalTileLength;
        }
    }
    return buildings;

}


