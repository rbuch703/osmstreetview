
function SkyDome(gl)
{

    this.gl = gl;

	var vertexShader   = glu.compileShader( document.getElementById("shader-vs").text, gl.VERTEX_SHADER);
	var fragmentShader = glu.compileShader( document.getElementById("texture-shader-fs").text, gl.FRAGMENT_SHADER);
	this.shaderProgram  = glu.createProgram( vertexShader, fragmentShader);
	gl.useProgram(this.shaderProgram);   //    Install the program as part of the current rendering state

    //get location of variables in shader program (to later bind them to values);
	this.shaderProgram.vertexPosAttribLocation =   gl.getAttribLocation( this.shaderProgram, "vertexPosition"); 
	this.shaderProgram.texCoordAttribLocation =    gl.getAttribLocation( this.shaderProgram, "vertexTexCoords"); 
    this.shaderProgram.modelViewMatrixLocation =   gl.getUniformLocation(this.shaderProgram, "modelViewMatrix")
	this.shaderProgram.perspectiveMatrixLocation = gl.getUniformLocation(this.shaderProgram, "perspectiveMatrix");
	//this.shaderProgram.hasHeightLocation =         gl.getUniformLocation(this.shaderProgram, "hasHeight");
	//this.shaderProgram.heightLocation =            gl.getUniformLocation(this.shaderProgram, "height");
	this.shaderProgram.texLocation =               gl.getUniformLocation(this.shaderProgram, "tex");

    this.buildGlGeometry();
}    
    
/*
SkyDome.prototype.onDataLoaded = function(response) {

    if (this.onLoaded)
        this.onLoaded();
    
    //console.log("Buildings: %o", this.buildings);
}*/

function onTextureLoaded(im, dome) {
	console.log("dome is %o; this is %o", dome, this);
	var gl = dome.gl;

    dome.tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dome.tex);
	//gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    //console.log("now loading texture %o of tile %o", metatile.canvas, metatile);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im); //load texture data
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);                  //set zoom-in filter to linear interpolation
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);    //set zoom-out filter to linear interpolation between pixels and mipmap levels
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // is a dome --> s-coordinate wraps (left edge = right edge)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // ... but t coordinate does not (top != bottom)
    gl.generateMipmap(gl.TEXTURE_2D);                                     // automatic mipmap generation
	
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
		
	var NUM_SLICES = 10;
	for (var i = 0; i < NUM_SLICES; i++)
	{
		var azimuth = i / NUM_SLICES * 2 * Math.PI;
		//var altitude= Math.PI * 0.3;
		
		var x1 = Math.cos(azimuth) * SkyDome.RADIUS;
		var y1 = Math.sin(azimuth) * SkyDome.RADIUS;
		//console.log(x1, y1, azimuth);
		var A = [x1,y1, 0];
		var D = [0,0, SkyDome.RADIUS];
		
		var azimuth = (i+1) / NUM_SLICES * 2 * Math.PI;
		var x2 = Math.cos(azimuth) * SkyDome.RADIUS;
		var y2 = Math.sin(azimuth) * SkyDome.RADIUS;
		
		var B = [x2, y2, 0];
		var C = [0,0, SkyDome.RADIUS];
		
		var verts = [].concat([], A, B, C, A, C, D);
		this.vertices.push.apply( this.vertices, verts);
		
		var tc_left = i/NUM_SLICES;
		var tc_right= (i+1)/NUM_SLICES;
		console.log("i: %s, left: %s, right: %s", i, tc_left, tc_right);
		var tcs = [tc_left,1, tc_right,1, tc_right,0, tc_left,1, tc_right,0, tc_left,0];
		this.texCoords.push.apply( this.texCoords, tcs);
	}
	
    
    
    console.log("total elements: %d vertex coordinates, %d texCoords", this.vertices.length, this.texCoords.length);
	console.log("verts: %o, texCoords: %o", this.vertices, this.texCoords);
	this.numVertices = this.vertices.length / 3;
    this.vertices = glu.createArrayBuffer(this.vertices);
    this.texCoords= glu.createArrayBuffer(this.texCoords);
}

SkyDome.prototype.render = function(modelViewMatrix, projectionMatrix) {
        
    var gl = this.gl;
	gl.useProgram(this.shaderProgram);   //    Install the program as part of the current rendering state
	gl.enableVertexAttribArray(this.shaderProgram.vertexPosAttribLocation); // setup vertex coordinate buffer
	gl.enableVertexAttribArray(this.shaderProgram.texCoordAttribLocation); //setup texcoord buffer

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);   //select the vertex buffer as the currrently active ARRAY_BUFFER (for subsequent calls)
	gl.vertexAttribPointer(this.shaderProgram.vertexPosAttribLocation, 3, this.gl.FLOAT, false, 0, 0);  //assigns array "vertices" bound above as the vertex attribute "vertexPosition"
    
	gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoords);
	gl.vertexAttribPointer(this.shaderProgram.texCoordAttribLocation, 2, this.gl.FLOAT, false, 0, 0);  //assigns array "texCoords" bound above as the vertex attribute "vertexTexCoords"

    gl.uniform1i(this.shaderProgram.texLocation, 0); //select texture unit 0 as the source for the shader variable "tex" 
	gl.uniformMatrix4fv(this.shaderProgram.modelViewMatrixLocation, false, modelViewMatrix);
    gl.uniformMatrix4fv(this.shaderProgram.perspectiveMatrixLocation, false, projectionMatrix);

    gl.activeTexture(gl.TEXTURE0);  //successive commands (here 'gl.bindTexture()') apply to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, this.tex); //render geometry without texture
    //gl.lineWidth(5.0);
    //console.log("starting rendering of buildings")

	//gl.uniform1i(this.shaderProgram.hasHeightLocation, 1); //select texture unit 0 as the source for the shader variable "tex" 
	    
	gl.drawArrays(gl.TRIANGLES, 0, this.numVertices);
}


SkyDome.RADIUS = 5000;
