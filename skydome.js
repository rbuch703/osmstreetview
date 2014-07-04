"use strict"
function SkyDome(gl)
{

    this.gl = gl;

    this.shaderProgram = glu.createShader(  document.getElementById("shader-vs").text,
                                            document.getElementById("texture-shader-fs").text,
                                            ["vertexPosition", "vertexTexCoords"],
                                            ["modelViewProjectionMatrix", "tex"] );

    this.buildGlGeometry();
}    

function onTextureLoaded(im, dome) {

    
    var maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    var maxTexPot = Math.round( Math.log(maxTexSize) / Math.log(2) );
    
    if (maxTexSize < im.width)
    {
        var canvas = document.createElement('canvas');
        canvas.width = 1 << maxTexPot;
        canvas.height= 1 << (maxTexPot -2);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
        
        im = canvas;
    }

    dome.tex = glu.createTexture(im);
	
	if (dome.onLoaded)
        dome.onLoaded();
}

SkyDome.prototype.buildGlGeometry = function() {
    /*this.indices = [];
    this.lengths = [];*/
    this.vertices= [];
    this.texCoords=[];
	
    var im = new Image();
	var dome = this;
    im.onload = function() { onTextureLoaded(im, dome); };
    im.src = "skydome.jpg";
    	
	var base = [];
	var top = [];
		
	var NUM_H_SLICES = 20;
	var NUM_V_SLICES = 10;
	for (var i = 0; i < NUM_H_SLICES; i++)
	{
		var azimuth1 = i / NUM_H_SLICES * 2 * Math.PI;    //convert to radiants in  [0...2*PI]
		var x1 = Math.cos(azimuth1) * SkyDome.RADIUS;
		var y1 = Math.sin(azimuth1) * SkyDome.RADIUS;

		var azimuth2 = (i+1) / NUM_H_SLICES * 2 * Math.PI;
		var x2 = Math.cos(azimuth2) * SkyDome.RADIUS;
		var y2 = Math.sin(azimuth2) * SkyDome.RADIUS;


	    for (var j = 0; j+1 <= NUM_V_SLICES; j++)
    	{
    	    //console.log(j, j+1, NUM_V_SLICES);
    	    var polar1 =  j    * Math.PI / (2.0 * NUM_V_SLICES); //convert to radiants in [0..1/2*PI]
    	    var polar2 = (j+1) * Math.PI / (2.0 * NUM_V_SLICES);

            
		    //console.log(x1, y1, azimuth);
		    var A = [x1 * Math.cos(polar1), y1 * Math.cos(polar1), SkyDome.RADIUS * Math.sin(polar1)];
		    var B = [x2 * Math.cos(polar1), y2 * Math.cos(polar1), SkyDome.RADIUS * Math.sin(polar1)];
		    var C = [x2 * Math.cos(polar2), y2 * Math.cos(polar2), SkyDome.RADIUS * Math.sin(polar2)];
		    var D = [x1 * Math.cos(polar2), y1 * Math.cos(polar2), SkyDome.RADIUS * Math.sin(polar2)];

		    /*var D = [0,0, SkyDome.RADIUS];
		    var C = [0,0, SkyDome.RADIUS];*/
		
		    var verts = [].concat([], A, B, C, A, C, D);
		    this.vertices.push.apply( this.vertices, verts);
		
		    var tc_left = i/NUM_H_SLICES;
		    var tc_right= (i+1)/NUM_H_SLICES;
		    var tc_top  = 1 - (j+1)/NUM_V_SLICES;
		    var tc_bottom=1 - j/ NUM_V_SLICES;
		    //console.log("i: %s, left: %s, right: %s", i, tc_left, tc_right);
		    var tcs = [tc_left,tc_bottom, tc_right,tc_bottom, tc_right,tc_top, tc_left,tc_bottom, tc_right,tc_top, tc_left,tc_top];
		    this.texCoords.push.apply( this.texCoords, tcs);
		}
	}
	
    
    
    //console.log("skydome totals to %d vertex coordinates, %d texCoords", this.vertices.length, this.texCoords.length);
	//console.log("verts: %o, texCoords: %o", this.vertices, this.texCoords);
	this.numVertices = this.vertices.length / 3;
    this.vertices = glu.createArrayBuffer(this.vertices);
    this.texCoords= glu.createArrayBuffer(this.texCoords);
}

SkyDome.prototype.render = function(modelViewMatrix, projectionMatrix) {
        
    var gl = this.gl;
	gl.useProgram(this.shaderProgram);   //    Install the program as part of the current rendering state
	gl.enableVertexAttribArray(this.shaderProgram.locations.vertexPosition); // setup vertex coordinate buffer
	gl.enableVertexAttribArray(this.shaderProgram.locations.vertexTexCoords); //setup texcoord buffer

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(this.shaderProgram.locations.vertexPosition, 3, this.gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
	gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoords);
	gl.vertexAttribPointer(this.shaderProgram.locations.vertexTexCoords, 2, this.gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"

    gl.uniform1i(this.shaderProgram.locations.tex, 0); //select texture unit 0 as the source for the shader variable "tex" 

    var mvpMatrix = mat4.create();
    mat4.mul(mvpMatrix, projectionMatrix, modelViewMatrix);
	gl.uniformMatrix4fv(this.shaderProgram.locations.modelViewProjectionMatrix, false, mvpMatrix);
    
    gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, this.tex); //render geometry without texture
    //gl.lineWidth(5.0);
    //console.log("starting rendering of buildings")

	//gl.uniform1i(this.shaderProgram.hasHeightLocation, 1); //select texture unit 0 as the source for the shader variable "tex" 
	    
	gl.drawArrays(gl.TRIANGLES, 0, this.numVertices);
}


SkyDome.RADIUS = 5000;

