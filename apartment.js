"use strict"

function Apartment(id, scaling, position, yaw, height) {

    this.textures = [];
    
    this.shaderProgram = glu.createShader(  document.getElementById("shader-vs").text, 
                                            document.getElementById("texture-shader-fs").text,
                                            ["vertexPosition", "vertexTexCoords"],
                                            ["modelViewProjectionMatrix", "tex"]);

    this.layoutId = id;
    this.layoutRequest = new XMLHttpRequest();
    this.layoutRequest.open("GET", "http://localhost:1080/rest/get/layoutJson/" + id);
    this.layoutRequest.responseType = "json";
    //this.layoutRequest.apartment = this;
    var aptTmp = this;
    this.layoutRequest.onreadystatechange = function() { var tmp = aptTmp.loadLayout(this, scaling, position, yaw, height); aptTmp.processLayout(tmp);}
    this.layoutRequest.send();
}

Apartment.prototype.render = function(modelViewMatrix, projectionMatrix)
{
    if (!this.vertices)
        return;
        
    var mvpMatrix = mat4.create();
    mat4.mul(mvpMatrix, projectionMatrix, modelViewMatrix);

	gl.useProgram(this.shaderProgram);   //    Install the program as part of the current rendering state
	gl.uniformMatrix4fv(this.shaderProgram.locations.modelViewProjectionMatrix, false, mvpMatrix);

	gl.enableVertexAttribArray(this.shaderProgram.locations.vertexPos); // setup vertex coordinate buffer
	gl.enableVertexAttribArray(this.shaderProgram.locations.vertexTexCoords); //setup texcoord buffer
    gl.uniform1i(this.shaderProgram.locations.tex, 0); //select texture unit 0 as the source for the shader variable "tex" 

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(this.shaderProgram.locations.vertexPos, 3, gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
	gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoords);
	gl.vertexAttribPointer(this.shaderProgram.locations.vertexTexCoords, 2, gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"

    
	for (var i = 0; i < this.numVertices; i+=6)
	{
        gl.activeTexture(gl.TEXTURE0);				
        gl.bindTexture(gl.TEXTURE_2D, this.textures[i/6]);
	    gl.drawArrays(gl.TRIANGLES, i, 6);
    }
	gl.flush();
}
			
			
Apartment.prototype.handleLoadedTexture = function(image) {
    this.textures[ image.id] = glu.createNpotTexture( image );
    if (Controller.onRequestFrameRender)
        Controller.onRequestFrameRender();
}

/* scoping hack: needs to be a dedicated function, because it is
 *               called within a loop over j. Without a dedicated function,
 *               the 'texture' and "j" variable would be shared between all 
 *               loop iterations, leading to the same texture being loaded 
 *               over and over again */
Apartment.prototype.requestTexture = function(layoutId, textureId)
{
    var image = new Image();
    image.id = textureId;
    image.apartment = this;

    image.onload = function() {
      this.apartment.handleLoadedTexture(image)
    }

    /*image.src = "tiles/tile_"+j+".png"; */
    image.crossOrigin = "anonymous";
    image.src = "http://localhost:1080/rest/get/texture/"+layoutId+"/"+textureId;
}
			
/**
 *  creates the 3D GL geometry scene.
 */
Apartment.prototype.processLayout = function(segments)
{
    this.vertices = [];
    this.texCoords= [];
    console.log("Processing Layout");
    for (var i in segments)
    {
        var seg = segments[i];
        /* D-C   
         * |/|
         * A-B  */
        var A = segments[i].pos;
        var w = segments[i].width;
        var B = [A[0]+w[0], A[1]+w[1], A[2]+w[2]];
        var h = segments[i].height;
        var C = [B[0]+h[0], B[1]+h[1], B[2]+h[2]];
        var D = [A[0]+h[0], A[1]+h[1], A[2]+h[2]];
        
        var verts = [].concat(A, B, C, /**/ A, C, D);
        [].push.apply(this.vertices, verts);
        
        var coords = [].concat([0,0], [1,0], [1,1], /**/ [0,0], [1,1], [0,1]);
        [].push.apply(this.texCoords, coords);
    }

    this.numVertices = (this.vertices.length / 3) | 0;
    
    this.vertices = glu.createArrayBuffer(this.vertices); //convert to webgl array buffer
    this.texCoords= glu.createArrayBuffer(this.texCoords);
    
    for (var i = 0; i < this.numVertices/6; i++) {
        this.requestTexture(this.layoutId, i);
    }
	
    //renderScene();
}
			
function getAABB( segments)
{
    if (segments.length < 1) return [];
    var min_x = segments[0].pos[0];
    var max_x = segments[0].pos[0];
    var min_y = segments[0].pos[1];
    var max_y = segments[0].pos[1];
    
    for (var i in segments)
    {
        max_x = Math.max(max_x, segments[i].pos[0]);
        min_x = Math.min(min_x, segments[i].pos[0]);
        max_y = Math.max(max_y, segments[i].pos[1]);
        min_y = Math.min(min_y, segments[i].pos[1]);
        
        var x = segments[i].pos[0] + segments[i].width[0]; //width may be negative, so pos+width can
        var y = segments[i].pos[1] + segments[i].width[1]; //be smaller or larger than pos alone

        max_x = Math.max(max_x, x);
        min_x = Math.min(min_x, x);
        max_y = Math.max(max_y, y);
        min_y = Math.min(min_y, y);
    }
    
    return {"min_x":min_x, "max_x":max_x, "min_y":min_y, "max_y":max_y};
}

var BLACK = 0xFF000000;
var WHITE = 0xFFFFFFFF;
var GRAY =  0xFF808080;
var GREEN = 0xFF00FF00;

var metersPerPixel = 10.0/720;

var HEIGHT = 2.5;
var WINDOW_LOW = 0.90;
var WINDOW_HIGH = 2.20;
var WINDOW_HEIGHT = WINDOW_HIGH - WINDOW_LOW;
var TOP_WALL_HEIGHT = HEIGHT - WINDOW_HIGH;

//var wallColor = [0.8, 0.8, 0.8];
//var windowColor = [15, 14, 12];

function createVector3(x, y, z) { return [x, y, z];}
function createRectangle( pos, width, height) { return {"pos": pos, "width": width, "height": height}; }

Apartment.prototype.addWindowedWall = function(startX, startY, dx, dy, scaling, /*ref*/segments)
{
    startX *= scaling;
    startY *= scaling;
    dx *= scaling;
    dy *= scaling;
    
    segments.push(createRectangle( createVector3(startX,startY,0+this.height),     //wall below window
                                   createVector3(dx, dy, 0), 
                                   createVector3(0, 0, WINDOW_LOW) ));
    //the window itself. Hack: Window height set to zero to make it invisible while still being present (to not confuse the order of tile textures)
    segments.push(createRectangle( createVector3(startX,startY,WINDOW_LOW+this.height), 
                                   createVector3(dx, dy, 0), 
                                   createVector3(0, 0, 0/*WINDOW_HEIGHT*/))); 
    segments.push(createRectangle( createVector3(startX,startY,WINDOW_HIGH+this.height),   //wall above window 
                                   createVector3(dx, dy, 0), 
                                   createVector3(0, 0, TOP_WALL_HEIGHT)));
}

Apartment.prototype.addWall = function(startX, startY, dx, dy, scaling, /*ref*/segments)
{
    startX *= scaling;
    startY *= scaling;
    dx *= scaling;
    dy *= scaling;

    segments.push(createRectangle( createVector3(startX,startY,0+this.height),
                                   createVector3(dx,dy,0),
                                   createVector3(0,0,HEIGHT)));
}

Apartment.rotate = function (vector, angle)
{
    angle = angle /180 * Math.PI;

    var v0    = Math.cos( angle ) * vector[0] - Math.sin( angle ) * vector[1] ;
    vector[1] = Math.sin( angle ) * vector[0] + Math.cos( angle ) * vector[1] ;
    
    vector[0] = v0;
}

Apartment.prototype.loadLayout = function(request, scaling, position, yaw, height)
{
        
    if (request.readyState != 4)
        return;

    //console.log("request: %o", request);

    var segments = [];
    var rectangles = request.response;
    for (var i in rectangles)
    {
        //console.log(rectangles[i]);
        rectangles[i].pos[0] *= scaling;
        rectangles[i].pos[1] *= scaling;
        rectangles[i].pos[2] *= scaling;
        
        rectangles[i].width[0] *= scaling;
        rectangles[i].width[1] *= scaling;
        rectangles[i].width[2] *= scaling;

        rectangles[i].height[0] *= scaling;
        rectangles[i].height[1] *= scaling;
        rectangles[i].height[2] *= scaling;

        rectangles[i].pos[2] += height;
        
        segments.push(rectangles[i]);


    }
    
    /*
function createRectangle( pos, width, height) { return {"pos": pos, "width": width, "height": height}; }


            if      (pxLeft == BLACK && pxHere == WHITE) this.addWall(x, endY,   0, startY - endY, scaling, segments); //transition from wall to inside area
            else if (pxLeft == WHITE && pxHere == BLACK) this.addWall(x, startY, 0, endY - startY, scaling, segments);// transition from inside area to wall
            else if (pxLeft == GREEN && pxHere == WHITE) this.addWindowedWall(x, endY,   0, startY - endY, scaling, segments);//transition from window to inside area
            else if (pxLeft == WHITE && pxHere == GREEN) this.addWindowedWall(x, startY, 0, endY - startY, scaling, segments);
        }
    } */   
    
    //step 3: shift apartment to relocate its center to (0,0) to give its 'position' a canonical meaning
    var aabb = getAABB( segments);
    var dx = aabb.max_x - aabb.min_x;
    var dy = aabb.max_y - aabb.min_y;
    var mid_x = (aabb.max_x + aabb.min_x) / 2.0;
    var mid_y = (aabb.max_y + aabb.min_y) / 2.0;

    for (var i in segments)
    {
        segments[i].pos[0] -= mid_x;
        segments[i].pos[1] -= mid_y;
    }    
    
   
    //step 4: rotate apartment;
    for (var i in segments)
    {
        Apartment.rotate( segments[i].pos, yaw);
        Apartment.rotate( segments[i].width, yaw);
        Apartment.rotate( segments[i].height, yaw);
    }    
    
    //step 5: move to selected position
    var earthCircumference = 2 * Math.PI * (6378.1 * 1000);
    var metersPerDegreeLat = earthCircumference / 360;
    var metersPerDegreeLng = metersPerDegreeLat * Math.cos( Controller.position.lat / 180 * Math.PI);

    var dx = (position.lng - Controller.position.lng) * metersPerDegreeLng;
    var dy = (position.lat - Controller.position.lat) * metersPerDegreeLat;
    
    console.log("distance to apartment: dx=%sm, dy=%sm", dx, dy);
    for (var i in segments)
    {
        //FIXME: why do those signs have to be different?
        segments[i].pos[0] += dx;
        segments[i].pos[1] -= dy;
    }    

    return segments;
}


