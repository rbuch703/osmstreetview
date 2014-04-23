"use strict"

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

    var earthCircumference = 2 * Math.PI * (6378.1 * 1000);
    //FIXME: find out why the final correction factor of 2.0 is necessary
    var physicalTileLength = earthCircumference* Math.cos(position.lat/180*Math.PI) / Math.pow(2, /*zoom=*/19);

    var numTilesPer500m = 500 / physicalTileLength;
    //console.log("numTilesPer500m: %s", numTilesPer500m);

    var x = long2tile(position.lng,19);
    var y = lat2tile( position.lat,19);
    
    
    var lng_min = tile2long(x - numTilesPer500m, 19);
    var lng_max = tile2long(x + numTilesPer500m, 19);
    
    var lat_min = tile2lat( y + numTilesPer500m, 19);
    var lat_max = tile2lat( y - numTilesPer500m, 19);

    //console.log("lat: %s-%s; lon: %s-%s", lat_min, lat_max, lng_min, lng_max);
    //var query = '[out:json][timeout:25];way["building"]('+lat_min+","+lng_min+","+lat_max+","+lng_max+');out body;>;out skel qt;';
    var bbox = '('+lat_min+","+lng_min+","+lat_max+","+lng_max+')';
    
    
    var query = '[out:json][timeout:25];(way["building"]'+bbox+
                                       ';way["building:part"]'+bbox+
                                       ';relation["building"]'+bbox+');out body;>;out skel qt;';
    //console.log("query: %s", query);
    var bldgs = this;
    var oReq = new XMLHttpRequest();
    oReq.onload = function() { bldgs.onDataLoaded(this); }
    //oReq.open("get", "http://overpass-api.de/api/interpreter?data=" + encodeURIComponent('[out:json][timeout:25];way["building"](52.1360,11.6356,52.1418,11.6416);out body;>;out skel qt;'), true);
    oReq.open("get", "http://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query), true);
    oReq.send();
    
    
    /*QL query: <bbox-query e="11.6416" n="52.1418" s="52.1360" w="11.6356"/> */
    /*corresponding "get" string:  [out:json][timeout:25];way["building"](52.1360,11.6356,52.1418,11.6416);out body;>;out skel qt;; */

	//compile and link shader program
	var vertexShader   = glu.compileShader( document.getElementById("building-shader-vs").text, gl.VERTEX_SHADER);
	var fragmentShader = glu.compileShader( document.getElementById("building-shader-fs").text, gl.FRAGMENT_SHADER);
	this.shaderProgram  = glu.createProgram( vertexShader, fragmentShader);
	gl.useProgram(this.shaderProgram);   //    Install the program as part of the current rendering state

    //get location of variables in shader program (to later bind them to values);
	this.shaderProgram.vertexPosAttribLocation =   gl.getAttribLocation( this.shaderProgram, "vertexPosition"); 
	this.shaderProgram.texCoordAttribLocation =    gl.getAttribLocation( this.shaderProgram, "vertexTexCoords"); 
	this.shaderProgram.normalAttribLocation   =    gl.getAttribLocation( this.shaderProgram, "vertexNormal"); 
	
	
    this.shaderProgram.modelViewMatrixLocation =   gl.getUniformLocation(this.shaderProgram, "modelViewMatrix")
	this.shaderProgram.perspectiveMatrixLocation = gl.getUniformLocation(this.shaderProgram, "perspectiveMatrix");
	//this.shaderProgram.hasHeightLocation =         gl.getUniformLocation(this.shaderProgram, "hasHeight");
	//this.shaderProgram.heightLocation =            gl.getUniformLocation(this.shaderProgram, "height");
	this.shaderProgram.texLocation =               gl.getUniformLocation(this.shaderProgram, "tex");
    this.numVertices = 0;
 
}    

function vec(a) { return [a.dx, a.dy];}
function sub(a, b) { return [a[0] - b[0], a[1]-b[1]]; }
function norm(a) { var len = Math.sqrt(a[0]*a[0] + a[1]*a[1]); return [a[0]/len, a[1]/len];}
function dot(a,b) { return a[0]*b[0] + a[1]*b[1];}
    
    
function simplifyOutline(building)
{
    var outline = building.outline;
    if (outline.length < 3) return;
    /*
    for (var i in building.outline)
        console.log("%s,%s", building.outline[i].dx, building.outline[i].dy);
    */
    var res = [];
    res[0] = outline[0];
    var prev = outline[0];
    var curr = outline[1];
    for (var i = 2; i < outline.length; i++)
    {
        var next = outline[i];
        //console.log(prev, curr, next);
        var v1 = norm(sub(vec(next), vec(prev)));   //v1 = norm( next - prev);
        var v2 = norm(sub(vec(next), vec(curr)));   //v2 = norm( next - curr);
        var cosArc = dot(v1, v2);
        
        //console.log("%s;%s;%s;%s;%s;%s;%s", prev.dx, prev.dy, curr.dx, curr.dy, next.dx, next.dy, cosArc);

        if (cosArc > 0.999)    //almost colinear (deviation < 2.6°) --> ignore 'curr' vertex
        {
            curr = next;
            continue;
        }
        
        res.push(curr);
        prev = curr;
        curr = next;
        //console.log("#", vec(prev));
        //console.log("v1: %o, v2: %o", v1, v2, prev, curr, next);
    } 
    res.push(outline[outline.length-1]);


    // Handle edge case: vertex 0 lies on a colienar line segment and should be remove
    // N.B.: in OSM data, the first and last vertex of an area are identical
    //       thus, the following algorithm skips the last vertex in the colinearity check
    //       and in case of colinearity removes the first *and* last vertex ( and 
    //       replicates the new first vertex as the new last one).
    /*console.log("---");
    for (var i in res)
        console.log("%s,%s", res[i].dx, res[i].dy);

    console.log("---");*/
    
    prev = res[res.length-2];
    
    curr = res[0];
    next = res[1];
    
    var v1 = norm(sub(vec(next), vec(prev)));   //v1 = norm( next - prev);
    var v2 = norm(sub(vec(next), vec(curr)));   //v2 = norm( next - curr);
    var cosArc = dot(v1, v2);
    //console.log("%s;%s;%s;%s;%s;%s;%s", prev.dx, prev.dy, curr.dx, curr.dy, next.dx, next.dy, cosArc);


    if (cosArc > 0.999)    //almost colinear (deviation < 2.6°) --> ignore 'curr' vertex
    {
        res = res.slice(1, res.length-1);
        res.push(res[0]);
    }    

    building.outline = res;
}
    
Buildings.prototype.onDataLoaded = function(response) {
    var res = JSON.parse(response.responseText);
    //console.log(res);
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
    var bldgs = {};
    for (var i = 0; i < res.elements.length; i++)
    {
        if (res.elements[i].type != "way")
            continue;
            
        var way = res.elements[i];

        var building = { outline: [], tags: way.tags };
        /*if (way.tags)   
        {            
            //hkjhkl
        }*/
        
        for (var j in way.nodes)
        {
            var id = way.nodes[j];
            if (id in nodes)
                building.outline.push( nodes[id]);
            else
                console.log("[WARN] Way %o contains node %d, but server response does not include node data. Skipping.", way, id);
        }
        //console.log("buildings %s has shape %o", way.id, building);
        bldgs[way.id] = building;
        
        //this.buildings.push(building);
    }

    //console.log("Buildings: %o", bldgs);
    
    //step 3: parse relations;
    for (var i in res.elements)
    {
        if (res.elements[i].type != "relation")
            continue;
            
        var rel = res.elements[i];
        
        //var tags = rel.tags;
        var num_outer = 0;
        var outer = [];
        var inner = [];
        
        for (var j in rel.members)
        {
            var member = rel.members[j];
            //console.log("scanning member %s of relation %s", member.ref, rel.id);
            if (member.type != "way")
                console.log("invalid member type %s on relation %s", member.type, rel.id);
            else
            {
                //console.log("INFO: rel %s references way %s/%o", rel.id, member.ref, bldgs[member.ref]);
                //console.log("member %s, %o: %o", member.ref, member, bldgs);
                if ((member.role == "outer") && (bldgs[member.ref]))
                    outer.push(  bldgs[member.ref] );

                if ((member.role == "inner") && (bldgs[member.ref]))
                    inner.push(  bldgs[member.ref] );
            }
            delete bldgs[member.ref];
        }
        //console.log("outers: %o, inners: %o", outer, inner);
        
        //console.log("relation with inner: %o, outer: %o", inner, outer);
        if (outer.length == 1)
        {
            outer = outer[0];
            if (!outer.tags) outer.tags = {};

            var relevant_tags = ["building", "building:part", "height", "min_height", 
                                 "roof:height", "roof:levels", "building:levels", "building:min_level"];
            
            for (var k in relevant_tags)
            {
                var tag = relevant_tags[k];
                if (tag in rel.tags)
                    outer.tags[tag] = rel.tags[tag];
            }
            //console.log("outer: %o, rel: %o", outer, rel);
            
            //for (var j in outer.outline)
            //    console.log("%s, %s, %o", outer.outline[j].lon, outer.outline[j].lat, outer.outline[j]);
                
            bldgs["r"+rel.id] = outer;
            //console.log(outer);
        } else
        {
            console.log("relation %s/%o has multiple 'outer' members, skippping", rel, rel);
        }
        //sdfds();
        //console.log(res.elements[i]);
        
    }
    
    //console.log("map center is lat/lng: %s%s; x/y: (%s,%s)", mapCenter.lat, mapCenter.lon , x, y);
    //console.log("Buildings set: %o", this);
    this.buildings = convertToLocalCoordinates(bldgs, this.mapCenter);
    //for (var i in this.buildings)
    //    simplifyOutline(this.buildings[i]);
        
    
        
    this.buildGlGeometry();
    
    if (this.onLoaded)
        this.onLoaded();
    
    //console.log("Buildings: %o", this.buildings);
}

function triangulate(outline)
{
    //console.log("triangulating outline %o", outline);
    var points = [];
    //skip final vertex (which duplicates the first one)
    //as poly2tri closes polygons implicitly
    //console.log("polygon has %s vertices", outline.length-1);
    for (var i = 0; i < outline.length-1; i++) 
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
        vertexData.push( tri.points_[0].x, tri.points_[0].y);
        vertexData.push( tri.points_[1].x, tri.points_[1].y);
        vertexData.push( tri.points_[2].x, tri.points_[2].y);
    }
    return vertexData;
    //console.log(vertexData);
    //sdkfjhk();
    
}

function norm(v)
{
    var len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    return [ v[0]/len, v[1]/len, v[2]/len];
}

Buildings.prototype.buildGlGeometry = function() {
    //this.indices = [];
    //this.lengths = [];
    this.vertices= [];
    this.texCoords=[];
    this.normals  =[];
    
    //var pos = 0;
    var vertexArrays = [];
    var texCoordArrays = [];

    for (var i in this.buildings)
    {
        //if (i[0] != "r") continue;
        var bldg = this.buildings[i];
        //console.log("processing building %s with %s vertices", i, bldg.outline.length);
        
        if (bldg.tags.height)
            bldg.height = parseFloat(bldg.tags.height);    //FIXME: currently assumes that all values are in meters (even if other unit is present)
        else if (bldg.tags["building:levels"])
        {
            bldg.height = parseInt(bldg.tags["building:levels"])*3.5;
            if (bldg.tags["roof:levels"])
                bldg.height += parseInt(bldg.tags["roof:levels"])*3.5;
        }
        //else
        //    building.height = 10.0; //FIXME: just a guess, replace by more educated guess

            
        if (bldg.tags.min_height)
            bldg.min_height = parseFloat(bldg.tags.min_height); //FIXME: currently assumes that all values are in meters (even if other unit is present)
        else if (bldg.tags["building:min_level"])
            bldg.min_height = parseInt(bldg.tags["building:min_level"])*3.5;
        else
            bldg.min_height = 0.0;
        
        
        
        var height = bldg.height ? bldg.height/2.0 : 10/2.0;
        var hf = bldg.height? 1 : 0;
        //console.log(bldg, bldg.height, height, hf);

        //triangulate(bldg.outline);
        //this.indices.push(pos);
        //this.lengths.push( (bldg.outline.length-1)*6 );
        //pos += (bldg.outline.length-1)*6;
        
        if (bldg.outline[0].dx != bldg.outline[bldg.outline.length-1].dx || bldg.outline[0].dy != bldg.outline[bldg.outline.length-1].dy)
            console.log("[WARN] outline of building %s does not form a closed loop (%o)", i, this.buildings);
        
        //step 1: build geometry for walls;
        for (var j = 0; j < bldg.outline.length - 1; j++) //loop does not include the final vertex, as we in each case access the successor vertex as well
        {
            //FIXME: find out why the 2.0 is necessary
            var min_height= bldg.min_height / 2.0;
                    
            var A = [bldg.outline[j  ].dx, bldg.outline[j  ].dy, min_height];
            var B = [bldg.outline[j+1].dx, bldg.outline[j+1].dy, min_height];
            var C = [bldg.outline[j+1].dx, bldg.outline[j+1].dy, height];
            var D = [bldg.outline[j  ].dx, bldg.outline[j  ].dy, height];
            
            var dx = bldg.outline[j+1].dx - bldg.outline[j].dx;
            var dy = bldg.outline[j+1].dy - bldg.outline[j].dy;

            var N = norm( [dy, -dx, 0] );
            // D-C
            // |/|
            // A-B
            //
            
            //flatten array of 3-element-arrays to a single array
            //var coords = [].concat.apply([], [A, B, C, A, C, D]);
            var coords = [].concat(A, B, C, A, C, D);
            this.vertices.push.apply(this.vertices, coords);
            
            var tc = [0,0,hf, 1,0,hf, 1,1,hf, 0,0,hf, 1,1,hf, 0,1,hf];
            this.texCoords.push.apply( this.texCoords, tc); //this 'hack' is way faster than concat()
            
            var norms = [].concat(N,N,N,N,N,N);
            this.normals.push.apply( this.normals, norms);
            //console.log(coords, tc, norms);
            //var norms = [].concat.apply(
        }
        
        //step 2: build roof geometry:
        /*
        var coords = triangulate(bldg.outline);
        //console.log("triangulated coords: %o", coords);
        //console.log("\t has %s vertices at height %s", coords.length/2.0, height);
        for (var j = 0; j < coords.length; j+=2)
        {
            //console.log("vertex (%s, %s, %s)", coords[j], coords[j+1], height);
            this.vertices.push(coords[j], coords[j+1], height);
            this.texCoords.push(0.5, 0.5,hf);
            this.normals.push( 0,0,1 ); //roof --> normal is pointing straight up
            
        }
        
        if (bldg.min_height > 0)
        {
            for (var j = 0; j < coords.length; j+=2)
            {
                //console.log("vertex (%s, %s, %s)", coords[j], coords[j+1], height);
                this.vertices.push(coords[j], coords[j+1], min_height);
                this.texCoords.push(0.5, 0.5,hf);
                this.normals.push( 0,0,-1 ); //floor --> normal is pointing straight down
            }

        }*/
        
    }
    //flatten array of arrays to a single array
    //this.vertices = [].concat.apply([], vertexArrays);
    //console.log("vertices has %s elements; %o", this.vertices.length, this.vertices);
    //alert(this.texCoords.length + "; " + this.vertices.length);
    this.numVertices = this.vertices.length/3.0;    // 3 coordinates per vertex
    
    console.log("'Buildings' totals to %s vertices and %s normals", this.numVertices, this.normals.length/3);
    //var norms = this.normals;
    //console.log("normals: %o", norms);
    this.vertices = glu.createArrayBuffer(this.vertices);
    this.texCoords= glu.createArrayBuffer(this.texCoords);
    this.normals  = glu.createArrayBuffer(this.normals);
}

Buildings.prototype.render = function(modelViewMatrix, projectionMatrix) {
    if (! this.numVertices)
        return;
        
    var gl = this.gl;
	gl.useProgram(this.shaderProgram);   //    Install the program as part of the current rendering state
	gl.enableVertexAttribArray(this.shaderProgram.vertexPosAttribLocation); // setup vertex coordinate buffer
	gl.enableVertexAttribArray(this.shaderProgram.texCoordAttribLocation); //setup texcoord buffer

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(this.shaderProgram.vertexPosAttribLocation, 3, gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
	gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoords);
	gl.vertexAttribPointer(this.shaderProgram.texCoordAttribLocation, 3, gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"

    // can apparently be -1 if the variable is not used inside the shader
    if (this.shaderProgram.normalAttribLocation > -1)
    {
	    gl.bindBuffer(gl.ARRAY_BUFFER, this.normals);
	    gl.vertexAttribPointer(this.shaderProgram.normalAttribLocation, 3, gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"
	}


    gl.uniform1i(this.shaderProgram.texLocation, 0); //select texture unit 0 as the source for the shader variable "tex" 
	gl.uniformMatrix4fv(this.shaderProgram.modelViewMatrixLocation, false, modelViewMatrix);
    gl.uniformMatrix4fv(this.shaderProgram.perspectiveMatrixLocation, false, projectionMatrix);

    gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, null); //render geometry without texture
    //gl.lineWidth(5.0);
    //console.log("starting rendering of buildings")

    /*for (var i in this.lengths)
    {
	    //gl.drawArrays(gl.LINE_LOOP, this.indices[i], this.lengths[i]);
        //console.log("rendering %d vertices starting from index %d", this.lengths[i], this.indices[i]);
        
        gl.uniform1i(this.shaderProgram.hasHeightLocation, this.buildings[i].height ? 1 : 0); //select texture unit 0 as the source for the shader variable "tex" 
	    
	    gl.drawArrays(gl.TRIANGLES, this.indices[i], this.lengths[i]);
	    //gl.drawArrays(gl.TRIANGLE_FAN, this.indices[i], this.lengths[i]);
    }*/
    //var last = this.indices.length-1;
    //console.log("rendering %s vertices", this.numVertices);
    gl.drawArrays(gl.TRIANGLES, 0, this.numVertices);

}


/* converts 'buildings' global coordinates (lat/lon) to local distances (in m) from mapCenter*/
function convertToLocalCoordinates(buildings,  mapCenter)
{
    var y0 = lat2tile(mapCenter.lat, 19);
    var x0 = long2tile(mapCenter.lng, 19);

    var earthCircumference = 2 * Math.PI * (6378.1 * 1000);
    //FIXME: find out why the final correction factor of 2.0 is necessary
    var physicalTileLength = earthCircumference* Math.cos(mapCenter.lat/180*Math.PI) / Math.pow(2, /*zoom=*/19) / 2.0;

    //for (var i = 0; i < buildings.length; i++)
    for (var i in buildings)
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


