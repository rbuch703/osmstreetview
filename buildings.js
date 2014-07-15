"use strict"

function Buildings(gl, position)
{

    this.gl = gl;
    if (!gl)
        return;
    this.mapCenter = position;//{lat:52.13850380245244, lng:11.64003610610962};

    var earthCircumference = 2 * Math.PI * (6378.1 * 1000);
    var physicalTileLength = earthCircumference* Math.cos(position.lat/180*Math.PI) / Math.pow(2, /*zoom=*/19);

    var numTilesPer500m = 500 / physicalTileLength * 2; //HACK: increase radius to 1km

    var x = long2tile(position.lng,19);
    var y = lat2tile( position.lat,19);
    
    
    var lng_min = tile2long(x - numTilesPer500m, 19);
    var lng_max = tile2long(x + numTilesPer500m, 19);
    
    var lat_min = tile2lat( y + numTilesPer500m, 19);
    var lat_max = tile2lat( y - numTilesPer500m, 19);

    //var query = '[out:json][timeout:25];way["building"]('+lat_min+","+lng_min+","+lat_max+","+lng_max+');out body;>;out skel qt;';
    var bbox = '('+lat_min+","+lng_min+","+lat_max+","+lng_max+')';
    
    
    var query = '[out:json][timeout:25];(way["building"]'+bbox+
                                       ';way["building:part"]'+bbox+
                                       ';relation["building"]'+bbox+');out body;>;out skel qt;';

    var bldgs = this;
    var oReq = new XMLHttpRequest();
    oReq.onload = function() { bldgs.onDataLoaded(this); }
    oReq.open("get", Buildings.apiBaseUrl + "?data=" + encodeURIComponent(query), true);
    oReq.send();
    
    
    this.shaderProgram = glu.createShader(document.getElementById("building-shader-vs").text,
                                          document.getElementById("building-shader-fs").text,
                                          ["vertexPosition","vertexTexCoords", "vertexNormal"],
                                          ["modelViewProjectionMatrix", "tex", "cameraPos"]);
                                          
    this.edgeShaderProgram = glu.createShader(document.getElementById("edge-shader-vs").text,
                                              document.getElementById("edge-shader-fs").text,
                                              ["vertexPosition"], ["modelViewProjectionMatrix"]);

    this.numVertices = 0;
    this.numEdgeVertices = 0;
}    

//Buildings.apiBaseUrl = "http://overpass-api.de/api/interpreter";
Buildings.apiBaseUrl = "http://tile.rbuch703.de/api/interpreter";

function vec(a) { return [a.dx, a.dy];}


function simplifyOutline(outline)
{
    var nodes = outline.nodes;
    if (nodes.length < 3) return;

    var res = [];
    res[0] = nodes[0];
    var prev = nodes[0];
    var curr = nodes[1];
    for (var i = 2; i < nodes.length; i++)
    {
        var next = nodes[i];

        var v1 = norm2(sub2(vec(next), vec(curr)));   //v1 = norm( next - curr);
        var v2 = norm2(sub2(vec(prev), vec(curr)));   //v2 = norm( prev - curr);
        var cosArc = dot2(v1, v2);
        
        if (Math.abs(cosArc) > 0.999)    //almost colinear (deviation < 2.6°) --> ignore 'curr' vertex
        {
            curr = next;
            continue;
        }
        
        res.push(curr);
        prev = curr;
        curr = next;
    } 
    res.push(nodes[nodes.length-1]);


    // Handle edge case: vertex 0 lies on a colinear line segment and should be removed
    // N.B.: in OSM data, the first and last vertex of an area are identical.
    //       thus, the following algorithm skips the last vertex in the colinearity check
    //       and in case of colinearity removes the first *and* last vertex ( and 
    //       replicates the new first vertex as the new last one).

    
    prev = res[res.length-2];
    
    curr = res[0];
    next = res[1];
    
    var v1 = norm2(sub2(vec(next), vec(curr)));   //v1 = norm( next - curr);
    var v2 = norm2(sub2(vec(prev), vec(curr)));   //v2 = norm( prev - curr);
    var cosArc = dot2(v1, v2);
    
    if (Math.abs(cosArc) > 0.999)    //almost colinear (deviation < 2.6°) --> ignore 'curr' vertex
    {
        res = res.slice(1, res.length-1);
        res.push(res[0]);
    }    

    outline.nodes = res;
}


/** standard polygon orientation test: 
  * 1. find a extreme vertex, e.g. the leftmost one
  * 2. determine the sign of opening angle between the adjacent edges (= the orientation)
  **/
function isClockwise(outline)
{
    var nodes = outline.nodes;
    if (nodes.length < 3) return;

    var minXIdx = 0;

    for (var i = 0; i < nodes.length; i++)
        if (nodes[i].dx < nodes[minXIdx].dx)
            minXIdx = i;
            
    //note: first and last vertex of a polygon are identical
    var predIdx = (minXIdx == 0) ? nodes.length - 2 : minXIdx - 1;
    var succIdx = (minXIdx == nodes.length-1) ? 1 : minXIdx + 1;
    
    var A = nodes[predIdx];
    var B = nodes[minXIdx];
    var C = nodes[succIdx];
    
    var det = (B.dx * C.dy + A.dx * B.dy + A.dy * C.dx) - (A.dy * B.dx + B.dy * C.dx + A.dx * C.dy);
    
    return det > 0;
}


/* in the osm3s response, nodes are individual entities with lon/lat properties, and ways refer to these nodes
   via their id. This function removes that indirection by replacing the node ids in the way by the actual node
   lon/lat data
*/
Buildings.integrateNodeData = function(nodes, ways) {
    for (var i in ways)
    {
        var way = ways[i];

        for (var j in way.nodes)
        {
            //var id = ;
            if (way.nodes[j] in nodes)
                way.nodes[j] = nodes[way.nodes[j]];
                //building.outline.push( nodes[id]);
            else
            {
                delete way.nodes[j];
                console.log("[WARN] Way %o contains node %d, but server response does not include that node data. Skipping.", way, id);
            }
        }
    }
}

Buildings.integrateWays = function(ways, relations) {
    for (var i in relations)
    {
        var rel = relations[i];

        for (var j in rel.members)
        {
            var member = rel.members[j];
            if (member.type != "way")
                continue;
            
            if (member.ref in ways)
            {
                /* way will not be handled as an explicit way, but as a part of the relation -> delete it.
                 * Flag it first (instead of deleting it right away) as several relations may
                 * refer to the same way.
                 */
                ways[member.ref].partOfRelation = true;   

                member.ref = ways[member.ref];
            }
            else
            {
                console.log("[WARN] Relation %o contains way %d, but server response does not include that way data. Skipping.", rel, member.ref);
            }
        }
    }
    
    for (var i in ways)
        if (ways[i].partOfRelation)
            delete ways[i];
}



/* The osm3s response consists of a single list of 'elements', which may each be nodes, ways or relations
   This method splits that single list into three distint lists for the three different entity types.
   For unknown reasons, a response may contain (at least) individual ways multiple times, once with tags and once without
   (This is probably due to us separately requesting ways and relation, which may in turn consist of ways).
   Thus, this method has to make sure that only that version with the most data of each way (and possible each node
   and relation) is used.
    
*/
Buildings.splitResponse = function(response)
{
    var nodes = {};
    var ways = {};
    var relations = {};
    
    for (var i in response.elements)
    {
        var el = response.elements[i];
        if (el.type == "node")
        {
            if (! (el.id in nodes) || (el.tags && ! nodes[el.id].tags))
                nodes[el.id] = el;
        }
        else if (el.type == "way")
        {
            if (! (el.id in ways) || (el.tags && !ways[el.id].tags))
                ways[el.id] = el;
        }
        else if (el.type == "relation")
        {
            if (! (el.id in relations) || (el.tags && ! relations[el.id].tags))
                relations[el.id] = el;
        }
        else
        {
            console.log("Unknown element '" + el.type + "' in %o, skipping", el);
        }
    }
    return [nodes, ways, relations];
}

Buildings.joinWays = function(w1, w2) {
    //step 1: formal checks for mergeability
    if (w1.role != w2.role)
        return false;
    var role = w1.role;
    
    if (w1.type != "way" || w2.type != "way")
        return false;
        
    if (w1.ref.nodes[0].id == w1.ref.nodes[w1.ref.nodes.length-1].id||
        w2.ref.nodes[0].id == w2.ref.nodes[w2.ref.nodes.length-1].id)
        return false;
    
    //step 2: merging node chains
    var nodes;    
    if (w1.ref.nodes[0].id == w2.ref.nodes[0].id)
    {
        nodes = w2.ref.nodes.reverse().slice(1).concat(w1.ref.nodes);
    } else if (w1.ref.nodes[0].id == w2.ref.nodes[w2.ref.nodes.length-1].id)
    {
        nodes = w2.ref.nodes.concat(w1.ref.nodes.slice(1));
    } else if (w2.ref.nodes[0].id == w1.ref.nodes[w1.ref.nodes.length-1].id)
    {
        nodes = w1.ref.nodes.concat(w2.ref.nodes.slice(1));
    } else if (w1.ref.nodes[w1.ref.nodes.length-1].id == w2.ref.nodes[w2.ref.nodes.length-1].id)
    {
        nodes = w1.ref.nodes.concat(w2.ref.nodes.reverse().slice(1));
    } else return false;

    /*step 3: merging tag sets. Strategy: hope that each attribute is either present in at most one of the
              two sets, or that both sets agree on the value for that attribute. If they don't, discard 
              the attribute belonging to the second set.
     */
    var tags = {};
    if (w1.ref.tags)
        tags = w1.ref.tags;
    
    if (w2.ref.tags)
    {
        for (var key in w2.ref.tags)
        {
            //var key = w2.ref.tags[i];
            if (! key in tags)
                tags[key] = w2.ref.tags[key];
            else
            {
                if (tags[key] != w2.ref.tags[key])
                    console.log("attribute value mismatch while merging ways %s and %s: %s:%s, %s:%s",
                        w1.ref.id, w2.ref.id, key, tags[key], key, w2.ref.tags[key]);
            }
        }
    }
    
    var merged_way = {id: w1.ref.id + ":" + w2.ref.id, tags: tags, "nodes": nodes};
    return { ref: merged_way, role: role, type: "way"};

}


/* Multipolygon-Relations in OSM may consist of several line segments (ways) of different roles:
 * These line segments may represent whole or partial outlines or holes in the multipolygon.
 * This method merges those ways that represent partial holes or outlines, so that all
 * (merged) ways in 'rel.outlines' are closed polygons
*/
Buildings.mergeMultiPolygonSegments = function(rel, relations) {

    //var rel = relations[i];
    rel.outlines = [];
    
    var currentOutline = null;
    
    for (var j in rel.members)
    {
        if (rel.members[j].type != "way")
        {
            if (rel.members[j].type == "node")
                continue;
            if (rel.members[j].type == "relation")
            {
                //console.log("rel: %o", rel);
                var childRel = relations[rel.members[j].ref];
                if (!childRel || !childRel.tags)
                {
                    console.log("[WARN] non-existent sub-relation %s of relation %s", rel.members[j].ref, rel.id);
                    continue;
                }
                //console.log("childRel: %o", childRel)
                if ((! ("tags" in childRel)) || (!("building" in childRel.tags || "building:part" in childRel.tags)))
                    console.log("[WARN] found sub-relation in %s that not itself a building(:part), ignoring", rel.id);
                
                continue;
            } 
            console.log("[WARN] invalid member type '%s' on relation %s", rel.members[j].type, rel.id);
            continue;
        }

        var way = rel.members[j];
        delete rel.members[j];
        /* if we currently have an open outline segment, then this next ways must be connectable
         * to that outline. If not then we have to fallback to close that open outline segment with a
         * straight line (which is usually not the intended result), store it, and continue with the next one
        */
        if (currentOutline)
        {
            var res = Buildings.joinWays(currentOutline, way);
            if (res) //join succeeded
                currentOutline = res;
            else //join failed --> force-close old outline
            {
                console.log("Force-closed way %s in relation %s", currentOutline.ref.id, rel.id)
                
                //if it is already closed, it should not be currentOutline in the first place
                if (currentOutline.ref.nodes[0] == currentOutline.ref.nodes[currentOutline.ref.nodes.length-1])
                    console.log("BUG: current outline should not be closed (at relation %s)", rel.id);
                else
                    currentOutline.ref.nodes.push(currentOutline.ref.nodes[0]);
                    
                rel.outlines.push(currentOutline);
                currentOutline = way;
            }
        } else
        {
            currentOutline = way;
        }
        
        //if currentOutline is closed, it is complete and can be stored away
        if (currentOutline)
        {
            //console.log(currentOutline);
            if (currentOutline.ref.nodes[0] == currentOutline.ref.nodes[currentOutline.ref.nodes.length-1])
            {
                rel.outlines.push(currentOutline);
                currentOutline = null;
            }
        }
    }
    
    /*if there is an open outline left, we have to force-close it (since there is no other segment left
     *to close it with) using a straight line */
    if (currentOutline)
    {
        if (currentOutline.ref.nodes[0] == currentOutline.ref.nodes[currentOutline.ref.nodes.length-1])
            console.log("BUG: current outline should not be closed (at relation %s)", rel.id);
        else
            currentOutline.ref.nodes.push(currentOutline.ref.nodes[0]);

        rel.outlines.push(currentOutline);
        currentOutline = null;
    }
    
    //console.log("Relation %s: %o", i, rel);

}


//distributes the attributes that a relationi may have buts its members may not to these members
Buildings.distributeAttributes = function(rel) {
    var important_tags = ["building:levels", "roof:levels", "building:min_level", "height", "min_height"];

    for (var i in rel.outlines)
    {
        var outline = rel.outlines[i];
        if (! outline.ref.tags)
            outline.ref.tags = {};
            
        for (var j in important_tags)
        {
            var key = important_tags[j];
            if (key in rel.tags)
            {
                if (! (key in outline.ref.tags))
                {
                    outline.ref.tags[key] = rel.tags[key];
                }
            }
        }
    }
}


Buildings.parseOSMQueryResult = function(res) {

    res = Buildings.splitResponse(res);
    var nodes = res[0];
    var ways = res[1];
    var relations = res[2];
    
    Buildings.integrateNodeData(nodes, ways);
    Buildings.integrateWays(ways, relations);
    //console.log("Nodes: %o,\nWays: %o,\nRelations: %o", nodes, ways, relations);
    //return;
    nodes = null;

    var outlines = [];
    
    for (var i in relations)
    {
        var rel = relations[i];
        Buildings.mergeMultiPolygonSegments( rel, relations );
        Buildings.distributeAttributes( rel );
        
        for (var j in rel.outlines)
            outlines.push( rel.outlines[j].ref);
    }
    
    for (var i in ways)
        outlines.push(ways[i]);
    
    //console.log(relations);
    //console.log(outlines);
    
	return outlines;
}
    
Buildings.prototype.onDataLoaded = function(response) {
    var osmQueryResult = JSON.parse(response.responseText);
	

    //console.log("map center is lat/lng: %s%s; x/y: (%s,%s)", mapCenter.lat, mapCenter.lon , x, y);
    //console.log("Buildings set: %o", this);
	var outlines = Buildings.parseOSMQueryResult(osmQueryResult);
    outlines = convertToLocalCoordinates(outlines, this.mapCenter);
    for (var i in outlines)
    {
        simplifyOutline(outlines[i]);
        if (isClockwise(outlines[i]))
        {
            outlines[i].nodes.reverse();
        }
    }
        
    this.buildGlGeometry(outlines);
    
    if (this.onLoaded)
        this.onLoaded();
    
    //console.log("Buildings: %o", this.buildings);
}

function triangulate(outline)
{
    //console.log("triangulating outline %o", outline);
    var points = [];
    //console.log("polygon has %s vertices", outline.length-1);
    if ((outline[0].dx != outline[outline.length-1].dx) ||
        (outline[0].dy != outline[outline.length-1].dy))
        console.log("[ERR] Non-closed polygon in outline.");
    
    for (var i = 0; i < outline.length - 1; i++) 
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
    
}

function getLengthInMeters(len_str) {
    // matches a float (including optional fractional part and optional 
    // exponent) followed by an optional unit of measurement
    var re = /^((\+|-)?\d+(\.\d+)?((e|E)-?\d+)?)\s*([a-zA-Z]*)?$/;
    var m = re.exec(len_str);
    if (!m)
    {
        console.log("cannot parse length string '" + len_str + "'");
        //fallback: if the string is not valid as a whole, let 
        //          JavaScript itself parse as much of it as possible
        return parseFloat(len_str); 
    }
    
    var val = parseFloat(m[1]);
    var unit= m[6];

    if (! unit) //no explicit unit --> unit is meters (OSM default)
        return val;
    
    if (unit == "m") //already in meters -> no conversion necessary
        return val; 

    console.log("unit is '" + unit + "'");
    if (console.warn)
        console.warn("no unit conversion performed");

    return val;
}

Buildings.prototype.buildGlGeometry = function(outlines) {
    if (!gl)
        return;
        
        
    this.vertices= [];
    this.texCoords=[];
    this.normals  =[];
    this.edgeVertices = [];
    
    var vertexArrays = [];
    var texCoordArrays = [];

    for (var i in outlines)
    {
        var bldg = outlines[i];

        if (bldg.tags.height)
            bldg.height = getLengthInMeters(bldg.tags.height);
        else if (bldg.tags["building:levels"])
        {
            bldg.height = parseFloat(bldg.tags["building:levels"])*3.5;
            if (bldg.tags["roof:levels"])
                bldg.height += parseFloat(bldg.tags["roof:levels"])*3.5;
        }
            
        if (bldg.tags.min_height)
            bldg.min_height = getLengthInMeters(bldg.tags.min_height);
        else if (bldg.tags["building:min_level"])
            bldg.min_height = parseInt(bldg.tags["building:min_level"])*3.5;
        else
            bldg.min_height = 0.0;
        
        var height = bldg.height ? bldg.height : 10;
        var hf = bldg.height? 1 : 0;

        if (bldg.nodes[0].dx != bldg.nodes[bldg.nodes.length-1].dx || bldg.nodes[0].dy != bldg.nodes[bldg.nodes.length-1].dy)
            console.log("[WARN] outline of building %s does not form a closed loop (%o)", i, bldg);
        
        //step 1: build geometry for walls;
        for (var j = 0; j < bldg.nodes.length - 1; j++) //loop does not include the final vertex, as we in each case access the successor vertex as well
        {
            var min_height= bldg.min_height;
                    
            var A = [bldg.nodes[j  ].dx, bldg.nodes[j  ].dy, min_height];
            var B = [bldg.nodes[j+1].dx, bldg.nodes[j+1].dy, min_height];
            var C = [bldg.nodes[j+1].dx, bldg.nodes[j+1].dy, height];
            var D = [bldg.nodes[j  ].dx, bldg.nodes[j  ].dy, height];
            
            var dx = bldg.nodes[j+1].dx - bldg.nodes[j].dx;
            var dy = bldg.nodes[j+1].dy - bldg.nodes[j].dy;

            var N = norm3( [dy, -dx, 0] );
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
            
            var edgeVertices = [].concat(A, D, B, C, A, B, D, C);
            this.edgeVertices.push.apply(this.edgeVertices, edgeVertices);
            
        }
        
        //step 2: build roof geometry:
        
        var coords;
        try {
            coords = triangulate(bldg.nodes);
        }
        catch(err)
        {
            console.log("triangulation of way %s failed", bldg.id);
            coords = [];
        }
        
        if (bldg.min_height > 0)
        {
            for (var j = 0; j < coords.length; j+=2)
            {
                this.vertices.push(coords[j], coords[j+1], min_height);
                this.texCoords.push(0.5, 0.5,hf);
                this.normals.push( 0,0,-1 ); //floor --> normal is pointing straight down
            }

        }
        
        if (coords.length % 6 != 0) //three vertices --> six coordinates per triangle
        {
            console.log("triangulation result is not a list of triangles");
            continue;
        }
        
        //console.log(coords.length, coords.length % 6);
        for (var j = 0; j < coords.length; j+=6)
        {
        
            this.vertices.push(coords[j], coords[j+1], height);
            this.vertices.push(coords[j+4], coords[j+5], height);   //order reversed to change orientation
            this.vertices.push(coords[j+2], coords[j+3], height);

            this.texCoords.push(0.5, 0.5,hf,  0.5, 0.5,hf,  0.5, 0.5,hf);
            this.normals.push( 0,0,1,  0,0,1,  0,0,1 ); //roof --> normal is pointing straight up
        }        
    }
    this.numVertices = this.vertices.length/3.0;    // 3 coordinates per vertex
    this.numEdgeVertices = this.edgeVertices.length/3.0;
    console.log("'Buildings' total to %s faces and %s edges", this.numVertices/3, this.numEdgeVertices/2);

    this.vertices = glu.createArrayBuffer(this.vertices);
    this.texCoords= glu.createArrayBuffer(this.texCoords);
    this.normals  = glu.createArrayBuffer(this.normals);
    this.edgeVertices = glu.createArrayBuffer(this.edgeVertices);
}

Buildings.prototype.render = function(modelViewMatrix, projectionMatrix) {
    if (! this.numVertices)
        return;
        
    var gl = this.gl;


    //draw faces
	gl.useProgram(this.shaderProgram);   //    Install the program as part of the current rendering state
	gl.enableVertexAttribArray(this.shaderProgram.locations.vertexPos); // setup vertex coordinate buffer
	gl.enableVertexAttribArray(this.shaderProgram.locations.vertexTexCoords); //setup texcoord buffer
	gl.enableVertexAttribArray(this.shaderProgram.locations.vertexNormal); //setup texcoord buffer

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(this.shaderProgram.locations.vertexPos, 3, gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
	gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoords);
	gl.vertexAttribPointer(this.shaderProgram.locations.vertexTexCoords, 3, gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"

    // can apparently be -1 if the variable is not used inside the shader
    if (this.shaderProgram.locations.vertexNormal > -1)
    {
	    gl.bindBuffer(gl.ARRAY_BUFFER, this.normals);
	    gl.vertexAttribPointer(this.shaderProgram.locations.vertexNormal, 3, gl.FLOAT, false, 0, 0);  //assigns array "normals"
	}

    var mvpMatrix = mat4.create();
    mat4.mul(mvpMatrix, projectionMatrix, modelViewMatrix);

    gl.uniform1i(this.shaderProgram.locations.tex, 0); //select texture unit 0 as the source for the shader variable "tex" 
	gl.uniformMatrix4fv(this.shaderProgram.locations.modelViewProjectionMatrix, false, mvpMatrix);

    var pos = Controller.localPosition;
    //console.log(pos.x, pos.y, pos.z);
    gl.uniform3f(this.shaderProgram.locations.cameraPos, pos.x, pos.y, pos.z);

    gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, null); //render geometry without texture
    
    gl.enable(gl.POLYGON_OFFSET_FILL);  //to prevent z-fighting between rendered edges and faces
    gl.polygonOffset(1,1);

    gl.drawArrays(gl.TRIANGLES, 0, this.numVertices);

    gl.disable(gl.POLYGON_OFFSET_FILL);
    // ===
    

    //step 2: draw outline
    gl.useProgram(this.edgeShaderProgram);   //    Install the program as part of the current rendering state
	gl.enableVertexAttribArray(this.edgeShaderProgram.locations.vertexPos); // setup vertex coordinate buffer

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeVertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(this.edgeShaderProgram.locations.vertexPos, 3, gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"

    var mvpMatrix = mat4.create();
    mat4.mul(mvpMatrix, projectionMatrix, modelViewMatrix);
	gl.uniformMatrix4fv(this.edgeShaderProgram.locations.modelViewProjectionMatrix, false, mvpMatrix);

    gl.drawArrays(gl.LINES, 0, this.numEdgeVertices);
    
}


/* converts 'buildings' global coordinates (lat/lon) to local distances (in m) from mapCenter*/
function convertToLocalCoordinates(buildings,  mapCenter)
{
    var y0 = lat2tile(mapCenter.lat, 19);
    var x0 = long2tile(mapCenter.lng, 19);

    var earthCircumference = 2 * Math.PI * (6378.1 * 1000);
    var physicalTileLength = earthCircumference* Math.cos(mapCenter.lat/180*Math.PI) / Math.pow(2, /*zoom=*/19);

    for (var i in buildings)
    {
        var bld = buildings[i];
        for (var j = 0; j < bld.nodes.length; j++)
        {
            var y = lat2tile(bld.nodes[j].lat, 19);
            var x = long2tile(bld.nodes[j].lon, 19);
            
            bld.nodes[j].dx = (x - x0) * physicalTileLength;
            bld.nodes[j].dy = (y - y0) * physicalTileLength;
        }
    }
    return buildings;

}


