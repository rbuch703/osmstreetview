
glu = {};

glu.compileShader = function (src_str, type)
{
    var shader = gl.createShader(type); //create abstract shader object
    gl.shaderSource(shader, src_str);   //set its GLSL source
    gl.compileShader(shader);           //Compile it
    //    Check for errors
    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.log("Couldn't compile the vertex shader: " + gl.getShaderInfoLog(shader) );
        //    Clean up
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

glu.createProgram = function (vShader, fShader)
{
    var shaderProgram = gl.createProgram();
	
	gl.attachShader(shaderProgram, vShader); 
	gl.attachShader(shaderProgram, fShader); 
	gl.linkProgram(shaderProgram);           
	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		alert("Unable to initialise shaders");
		//    Clean up
		gl.deleteProgram(shaderProgram);
		gl.deleteProgram(vertexShader);
		gl.deleteProgram(fragmentShader);
		return null;
	}			   
	return shaderProgram;
}


glu.createArrayBuffer = function(data)
{
	    
    var buffer = gl.createBuffer(); //    create a buffer to store our data in
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); //    Bind the buffer object to the ARRAY_BUFFER target.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); //fill the bound array buffer
	return buffer;
}
