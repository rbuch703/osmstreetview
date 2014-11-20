"use strict"
/* Copyright (c) 2014, Robert Buchholz <rbuch703@gmail.com> 
   The contents of this file are licensed under the GNU General Public License version 3
   (see the LICENSE file in the project root for details)
*/


/**
 * @constructor
 */
function Buildings(gl, position)
{
    if (!gl)
        return;
    this.mapCenter = position;//{lat:52.13850380245244, lng:11.64003610610962};

    this.windowTexture = glu.createTextureFromBytes( new Uint8Array([255, 255, 255]) );
    gl.bindTexture(gl.TEXTURE_2D, this.windowTexture);
    //to allow tiling of windows
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    var image = new Image();
    var bldgs = this;
    image.onload = function() 
    {
        glu.updateTexture( bldgs.windowTexture, image);
        
        if (Controller.onRequestFrameRender)
            Controller.onRequestFrameRender();
    };
    image.src = "images/window.png";


    var earthCircumference = 2 * Math.PI * (6378.1 * 1000);
    var RADIUS = 1000;  //half-width of the bounding box around the position for which to download building data
    var latInRadiants = position.lat/180*Math.PI;
    var dLat = RADIUS                             /earthCircumference* 360;
    var dLng = (RADIUS/ Math.cos(latInRadiants) ) /earthCircumference* 360;

    var lng_min = position.lng - dLng;
    var lng_max = position.lng + dLng;

    var lat_min = position.lat - dLat;
    var lat_max = position.lat + dLat;

    //var query = '[out:json][timeout:25];way["building"]('+lat_min+","+lng_min+","+lat_max+","+lng_max+');out body;>;out skel qt;';
    var bbox = '('+lat_min+","+lng_min+","+lat_max+","+lng_max+')';
    
    
    var query = '[out:json][timeout:25];(way["building"]'+bbox+
                                       ';way["building:part"]'+bbox+
                                       ';relation["type"="multipolygon"]["building"]'+bbox+
                                       ';relation["type"="building"]'+bbox+
                                       ');out body;>;out skel qt;';

    var bldgs = this;
    var oReq = new XMLHttpRequest();
    oReq.onload = function() { bldgs.onDataLoaded(this); }
    oReq.open("get", Buildings.apiBaseUrl + "?data=" + encodeURIComponent(query), true);
    oReq.send();
    

    this.numVertices = 0;
    this.numEdgeVertices = 0;
}    

Buildings.apiBaseUrl = "http://overpass-api.de/api/interpreter";

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


/* in the osm3s response, nodes are individual entities with lat/lng properties, and ways refer to these nodes
   via their id. This function removes that indirection by replacing the node ids in the way by the actual node
   lat/lng data
*/
Buildings.integrateNodeData = function(nodes, ways) {
    for (var i in ways)
    {
        var way = ways[i];

        for (var j in way.nodes)
        {
            if (way.nodes[j] in nodes)
                way.nodes[j] = nodes[way.nodes[j]];
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
                /* way will not be handled as an explicit way, but as a part of a multipolygon -> delete it.
                 * Flag it first (instead of deleting it right away) as several relations may
                 * refer to the same way.
                 */
                if (rel.tags.type === "multipolygon")
                {
                    ways[member.ref].partOfRelation = true;   
                    member.ref = ways[member.ref];
                }
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
            if (! (el.id in relations) || (( el.tags != undefined) && (relations[el.id].tags === undefined)))
                relations[el.id] = el;
        }
        else
        {
            console.log("Unknown element '" + el.type + "' in %o, skipping", el);
        }
    }

    for (var i in ways)
    {
        if (ways[i].tags === undefined)
            ways[i].tags = {};
    }
    
    for (var i in relations)
    {
        if (relations[i].tags === undefined)
            relations[i].tags = {};
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
Buildings.mergeMultiPolygonSegments = function(rel, setOfRelations) {

    if (rel.tags.type != "multipolygon")
    {
        console.log("[ERROR] attempt to merge multipolygon segments in relation %s that is not a multipolygon", rel.id);
        return;
    }
    //var rel = relations[i];
    rel.outlines = [];
    
    var currentOutline = null;
    for (var j in rel.members)
    {
        var member = rel.members[j];
        if (member.type == "node")
            continue;

        if (member.type == "relation")
        {
            //console.log("rel: %o", rel);
            var childRel = setOfRelations[member.ref];
            if (!childRel)
            {
                console.log("[WARN] non-existent sub-relation %s of relation %s", member.ref, rel.id);
                continue;
            }
            //console.log("childRel: %o", childRel)
            if ((! ("tags" in childRel)) || (!("building" in childRel.tags || "building:part" in childRel.tags)))
                console.log("[WARN] found sub-relation in %s that not itself a building(:part), ignoring", rel.id);
            
            continue;
        } 
        
        if (member.type != "way")
        {
            console.log("[WARN] invalid member type '%s' on relation %s", member.type, rel.id);
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


//distributes the attributes that a relation may have, but its members may not, to these members
Buildings.distributeAttributes = function(rel) {
    var important_tags = ["building:levels", "roof:levels", "building:min_level", "height", "min_height", 
                          "building:colour", "building:color", "roof:colour", "roof:color"];


    if (! ("tags" in rel))
        return;

    //console.log(rel, rel.id, rel.tags);

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

Buildings.sanitizeTags = function(tags, src) {
    //console.log("%o", tags);
    if ("building:height" in tags && !("height" in tags))
    {
        console.log("[INFO] depricated tag 'building:height' in %s %s", src.type, src.id);
        tags.height = tags["building:height"];
        delete tags["building:height"];
    }
    
    if ("building:min_height" in tags && !("min_height" in tags))
    {
        console.log("[INFO] depricated tag 'building:min_height' in %s %s", src.type, src.id);
        tags.height = tags["building:min_height"];
        delete tags["building:min_height"];
    }    
}

Buildings.parseOSMQueryResult = function(res) {

    res = Buildings.splitResponse(res);
    var nodes = res[0];
    var ways = res[1];
    var relations = res[2];

    // remove outline relations and ways. Those are present in the OSM data for the sole purpose of 2D rendering,
    // when there is additional 3D geometry superseeding it.
    for (var i in relations)
    {
        Buildings.sanitizeTags(relations[i].tags, relations[i]);
        if (relations[i].tags.type != "building")
            continue;
            
        for (var j in relations[i].members)
        {
            var member = relations[i].members[j];
            
            if (member.role != "outline")
                continue;
                
            if (member.type === "way")
                delete ways[member.ref];

            if (member.type === "relation")
                delete relations[member.ref];
        }
    }

    Buildings.integrateNodeData(nodes, ways);
    Buildings.integrateWays(ways, relations);
    //console.log("Nodes: %o,\nWays: %o,\nRelations: %o", nodes, ways, relations);
    //return;
    nodes = null;

    var outlines = [];
    
    for (var i in relations)
    {
        var rel = relations[i];
        if (rel.tags.type != "multipolygon")
			continue;

        
        Buildings.mergeMultiPolygonSegments( rel, relations );
        Buildings.distributeAttributes( rel );
        
        for (var j in rel.outlines)
            outlines.push( rel.outlines[j].ref);
    }

    for (var i in ways)
    {
        Buildings.sanitizeTags(ways[i].tags, ways[i]);

        if ( "building" in ways[i].tags || "building:part" in ways[i].tags )
        {
            outlines.push(ways[i]);
        }
    }
    
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
    len_str = len_str.replace(",", "."); //workaround for lengths with the wrong decimal seperator

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

//map of all default CSS color names
Buildings.colors = {
"aliceblue":"#f0f8ff","antiquewhite":"#faebd7","aqua":"#00ffff","aquamarine":"#7fffd4","azure":"#f0ffff",
"beige":"#f5f5dc","bisque":"#ffe4c4","black":"#000000","blanchedalmond":"#ffebcd","blue":"#0000ff",
"blueviolet":"#8a2be2","brown":"#a52a2a","burlywood":"#deb887","cadetblue":"#5f9ea0","chartreuse":"#7fff00",
"chocolate":"#d2691e","coral":"#ff7f50","cornflowerblue":"#6495ed","cornsilk":"#fff8dc","crimson":"#dc143c",
"cyan":"#00ffff","darkblue":"#00008b","darkcyan":"#008b8b","darkgoldenrod":"#b8860b","darkgray":"#a9a9a9",
"darkgreen":"#006400","darkkhaki":"#bdb76b","darkmagenta":"#8b008b","darkolivegreen":"#556b2f","darkorange":"#ff8c00",
"darkorchid":"#9932cc","darkred":"#8b0000","darksalmon":"#e9967a","darkseagreen":"#8fbc8f","darkslateblue":"#483d8b",
"darkslategray":"#2f4f4f","darkturquoise":"#00ced1","darkviolet":"#9400d3","deeppink":"#ff1493","deepskyblue":"#00bfff",
"dimgray":"#696969","dodgerblue":"#1e90ff","firebrick":"#b22222","floralwhite":"#fffaf0","forestgreen":"#228b22",
"fuchsia":"#ff00ff","gainsboro":"#dcdcdc","ghostwhite":"#f8f8ff","gold":"#ffd700","goldenrod":"#daa520",
"gray":"#808080","green":"#008000","greenyellow":"#adff2f","honeydew":"#f0fff0","hotpink":"#ff69b4",
"indianred":"#cd5c5c","indigo":"#4b0082","ivory":"#fffff0","khaki":"#f0e68c","lavender":"#e6e6fa",
"lavenderblush":"#fff0f5","lawngreen":"#7cfc00","lemonchiffon":"#fffacd","lightblue":"#add8e6","lightcoral":"#f08080",
"lightcyan":"#e0ffff","lightgoldenrodyellow":"#fafad2","lightgrey":"#d3d3d3","lightgreen":"#90ee90",
"lightpink":"#ffb6c1","lightsalmon":"#ffa07a","lightseagreen":"#20b2aa","lightskyblue":"#87cefa",
"lightslategray":"#778899","lightsteelblue":"#b0c4de","lightyellow":"#ffffe0","lime":"#00ff00","limegreen":"#32cd32",
"linen":"#faf0e6","magenta":"#ff00ff","maroon":"#800000","mediumaquamarine":"#66cdaa","mediumblue":"#0000cd",
"mediumorchid":"#ba55d3","mediumpurple":"#9370d8","mediumseagreen":"#3cb371","mediumslateblue":"#7b68ee",
"mediumspringgreen":"#00fa9a","mediumturquoise":"#48d1cc","mediumvioletred":"#c71585","midnightblue":"#191970",
"mintcream":"#f5fffa","mistyrose":"#ffe4e1","moccasin":"#ffe4b5","navajowhite":"#ffdead","navy":"#000080",
"oldlace":"#fdf5e6","olive":"#808000","olivedrab":"#6b8e23","orange":"#ffa500","orangered":"#ff4500","orchid":"#da70d6",
"palegoldenrod":"#eee8aa","palegreen":"#98fb98","paleturquoise":"#afeeee","palevioletred":"#d87093",
"papayawhip":"#ffefd5","peachpuff":"#ffdab9","peru":"#cd853f","pink":"#ffc0cb","plum":"#dda0dd","powderblue":"#b0e0e6",
"purple":"#800080","red":"#ff0000","rosybrown":"#bc8f8f","royalblue":"#4169e1","saddlebrown":"#8b4513",
"salmon":"#fa8072","sandybrown":"#f4a460","seagreen":"#2e8b57","seashell":"#fff5ee","sienna":"#a0522d",
"silver":"#c0c0c0","skyblue":"#87ceeb","slateblue":"#6a5acd","slategray":"#708090","snow":"#fffafa",
"springgreen":"#00ff7f","steelblue":"#4682b4","tan":"#d2b48c","teal":"#008080","thistle":"#d8bfd8","tomato":"#ff6347",
"turquoise":"#40e0d0","violet":"#ee82ee","wheat":"#f5deb3","white":"#ffffff","whitesmoke":"#f5f5f5","yellow":"#ffff00",
"yellowgreen":"#9acd32"};

Buildings.toneDownColor = function(col, fac, brighten)
{
    var l = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2];   //luminance
    if (brighten)
        l += 0.25;
    return [ (1-fac)*col[0] + fac*l,
              (1-fac)*col[1] + fac*l,
              (1-fac)*col[2] + fac*l];
}


Buildings.interpretColor = function(col, defaultColor)
{
    if (col === undefined)
        return defaultColor;
        
    if (col in Buildings.colors)
        col = Buildings.colors[col];
    
    var re = new RegExp("^#([a-fA-F0-9]{6})$");   //a hash sign followed by exactly six hexadecimal characters
    var m = col.match(re)
    if (m)
    {
        col = m[1]; //m[0] returns the whole matched string, m[1] only the submatch in the first set of parentheses
        //console.log(col);
        var r = parseInt("" + col[0] + col[1], 16)/255.0;
        var g = parseInt("" + col[2] + col[3], 16)/255.0;
        var b = parseInt("" + col[4] + col[5], 16)/255.0;
        return Buildings.toneDownColor([r, g, b], 0.5, true);
    }
    

    return defaultColor;
}

Buildings.prototype.buildGlGeometry = function(outlines) {
    if (!gl)
        return;
        
        
    this.vertices= [];
    this.vertexColors= [];
    this.texCoords=[];
    this.normals  =[];
    this.edgeVertices = [];
    
    for (var i in outlines)
    {
        var bldg = outlines[i];
        if (! ("tags" in bldg))
            bldg.tags = {};
            
        //if ("building:colour" in bldg.tags)
        //    console.log("building with color %s", bldg.tags["building:colour"]);

        if ("height" in bldg.tags)
            bldg.height = getLengthInMeters(bldg.tags.height);
        else if (bldg.tags["building:levels"])
        {
            bldg.height = parseFloat(bldg.tags["building:levels"])*3.5;
            if (bldg.tags["roof:levels"])
                bldg.height += parseFloat(bldg.tags["roof:levels"])*3.5;
        }
        
        // zero-height buildings are usually outlines that are tagged this way to prevent 3D rendering
        // additional geometry exists to render the actual buildings structure
        if (bldg.height == 0)
            continue;
        
            
        if (bldg.tags.min_height)
            bldg.min_height = getLengthInMeters(bldg.tags.min_height);
        else if (bldg.tags["building:min_level"])
            bldg.min_height = parseInt(bldg.tags["building:min_level"])*3.5;
        else
            bldg.min_height = 0.0;

        //console.log("Height is %s", bldg.height);
        var height = (!(bldg.height === undefined)) ? bldg.height : 10;
        var hf = (!(bldg.height === undefined)) ? 1 : 0;
        
        var vDist = height - bldg.min_height;
        var numLevels = Math.floor( vDist/3.5);

        if (bldg.nodes[0].dx != bldg.nodes[bldg.nodes.length-1].dx || bldg.nodes[0].dy != bldg.nodes[bldg.nodes.length-1].dy)
            console.log("[WARN] outline of building %s does not form a closed loop (%o)", i, bldg);
        
        bldg.color = [0.8, 0.8, 0.8];
        bldg.roofColor = [0.8, 0.8, 0.8];
        
        //use incorrect tag name first, overwrite with correct one if it exists
        bldg.color = Buildings.interpretColor(bldg.tags["building:color"], bldg.color);
        bldg.color = Buildings.interpretColor(bldg.tags["building:colour"], bldg.color);    

        bldg.roofColor = Buildings.interpretColor(bldg.tags["roof:color"], bldg.roofColor);
        bldg.roofColor = Buildings.interpretColor(bldg.tags["roof:colour"], bldg.roofColor);    
        
        
        if (bldg.height === undefined)
        {
            bldg.color = [0.9, 0.6, 0.6];
            bldg.roofColor=[0.9, 0.6, 0.6];
        }

        
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

            var hDist = Math.floor(Math.sqrt(dx*dx+dy*dy) / 2.0);
            var N = norm3( [dy, -dx, 0] );
            // D-C
            // |/|
            // A-B
            //
            
            //flatten array of 3-element-arrays to a single array
            //var coords = [].concat.apply([], [A, B, C, A, C, D]);
            var coords = [].concat(A, B, C, A, C, D);
            [].push.apply(this.vertices, coords);
            
            var colors = [].concat(bldg.color, bldg.color, bldg.color, bldg.color, bldg.color, bldg.color);
            [].push.apply( this.vertexColors, colors);
            
            var tc = [0,0,   hDist,0,   hDist,numLevels,   0,0,   hDist,numLevels,   0,numLevels];
            [].push.apply( this.texCoords, tc); //this 'hack' is way faster than concat()
            
            var norms = [].concat(N,N,N,N,N,N);
            [].push.apply( this.normals, norms);
            
            var edgeVertices = [].concat(A, D, B, C, A, B, D, C);
            [].push.apply(this.edgeVertices, edgeVertices);
            
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
                [].push.apply(this.vertexColors, bldg.color);
                this.vertices.push(coords[j], coords[j+1], min_height);
                this.texCoords.push(0.0, 0.0);
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

            var colors = [].concat(bldg.roofColor, bldg.roofColor, bldg.roofColor);
            [].push.apply( this.vertexColors, colors);


            this.texCoords.push(0.5, 0.5,  0.5, 0.5,  0.5, 0.5);
            this.normals.push( 0,0,1,  0,0,1,  0,0,1 ); //roof --> normal is pointing straight up
        }
    }
    this.numVertices = this.vertices.length/3.0;    // 3 coordinates per vertex
    this.numEdgeVertices = this.edgeVertices.length/3.0;
    console.log("[INFO] 'Buildings' total to %s faces, and %s edges", this.numVertices/3, this.numEdgeVertices/2);
    this.vertices = glu.createArrayBuffer(this.vertices);
    this.vertexColors = glu.createArrayBuffer(this.vertexColors);
    this.texCoords= glu.createArrayBuffer(this.texCoords);
    this.normals  = glu.createArrayBuffer(this.normals);
    this.edgeVertices = glu.createArrayBuffer(this.edgeVertices);
}

Buildings.prototype.renderDepth = function(modelViewMatrix, projectionMatrix) {
    if (! this.numVertices || !Shaders.ready)
        return;
        
	gl.useProgram(Shaders.depth);   //    Install the program as part of the current rendering state
	gl.enableVertexAttribArray(Shaders.depth.locations.vertexPosition); // setup vertex coordinate buffer

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(Shaders.depth.locations.vertexPosition, 3, gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
    var mvpMatrix = mat4.create();
    mat4.mul(mvpMatrix, projectionMatrix, modelViewMatrix);

	gl.uniformMatrix4fv(Shaders.depth.locations.modelViewProjectionMatrix, false, mvpMatrix);

    //gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0
    //gl.bindTexture(gl.TEXTURE_2D, null); //render geometry without texture
    
    gl.drawArrays(gl.TRIANGLES, 0, this.numVertices);    

    gl.cullFace(gl.BACK);   //reset to normal behavior

}


Buildings.prototype.render = function(modelViewMatrix, projectionMatrix) {
    if (! this.numVertices || !Shaders.ready)
        return;
        
    //draw faces
	gl.useProgram(Shaders.building);   //    Install the program as part of the current rendering state

	gl.enableVertexAttribArray(Shaders.building.locations.vertexPosition); // setup vertex coordinate buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(Shaders.building.locations.vertexPosition, 3, gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
	gl.enableVertexAttribArray(Shaders.building.locations.vertexTexCoords); //setup texcoord buffer
	gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoords);
	gl.vertexAttribPointer(Shaders.building.locations.vertexTexCoords, 2, gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"

    if (Shaders.building.locations.vertexColorIn > -1)
    {
    	gl.enableVertexAttribArray(Shaders.building.locations.vertexColorIn); //setup texcoord buffer
	    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexColors);
	    gl.vertexAttribPointer(Shaders.building.locations.vertexColorIn, 3, gl.FLOAT, false, 0, 0);
	}

    // can apparently be -1 if the variable is not used inside the shader
    if (Shaders.building.locations.vertexNormal > -1)
    {
    	gl.enableVertexAttribArray(Shaders.building.locations.vertexNormal); //setup texcoord buffer
	    gl.bindBuffer(gl.ARRAY_BUFFER, this.normals);
	    gl.vertexAttribPointer(Shaders.building.locations.vertexNormal, 3, gl.FLOAT, false, 0, 0);  //assigns array "normals"
	}

    var mvpMatrix = mat4.create();
    mat4.mul(mvpMatrix, projectionMatrix, modelViewMatrix);

    gl.uniform1i(Shaders.building.locations.tex, 0); //select texture unit 0 as the source for the shader variable "tex" 
    gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, this.windowTexture); //render geometry without texture

	gl.uniformMatrix4fv(Shaders.building.locations.modelViewProjectionMatrix, false, mvpMatrix);

    var pos = Controller.localPosition;
    //console.log(pos.x, pos.y, pos.z);
    gl.uniform3f(Shaders.building.locations.cameraPos, pos.x, pos.y, pos.z);

    //gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0
    //gl.bindTexture(gl.TEXTURE_2D, null); //render geometry without texture
    
    gl.enable(gl.POLYGON_OFFSET_FILL);  //to prevent z-fighting between rendered edges and faces
    gl.polygonOffset(1,1);

    gl.drawArrays(gl.TRIANGLES, 0, this.numVertices);

    gl.disable(gl.POLYGON_OFFSET_FILL);
    // ===
    

    //step 2: draw outline
    gl.useProgram(Shaders.flat);   //    Install the program as part of the current rendering state
	gl.enableVertexAttribArray(Shaders.flat.locations.vertexPosition); // setup vertex coordinate buffer

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeVertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(Shaders.flat.locations.vertexPosition, 3, gl.FLOAT, false, 0, 0);  //assigns array "edgeVertices" bound above as the vertex attribute "vertexPosition"

    var mvpMatrix = mat4.create();
    mat4.mul(mvpMatrix, projectionMatrix, modelViewMatrix);
	gl.uniformMatrix4fv(Shaders.flat.locations.modelViewProjectionMatrix, false, mvpMatrix);
	
	gl.uniform4fv( Shaders.flat.locations.color, [0.2, 0.2, 0.2, 1.0]);

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


