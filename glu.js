"use strict"    

/* Copyright (c) 2015, Robert Buchholz <rbuch703@gmail.com> 
   The contents of this file are licensed under the GNU General Public License version 3
   (see the LICENSE file in the project root for details)
*/

var glu = {

compileShader: function (src_str, type)
{
    var shader = gl.createShader(type); //create abstract shader object
    gl.shaderSource(shader, src_str);   //set its GLSL source
    gl.compileShader(shader);           //Compile it
    //    Check for errors
    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        //console.log("Couldn't compile the shader: " + gl.getShaderInfoLog(shader) );
        //    Clean up
        var errorMsg = gl.getShaderInfoLog(shader);
//        console.log(errorMsg);
        gl.deleteShader(shader);
        return [false, "Couldn't compile the shader: " + errorMsg + "\nSource is: " + src_str];
    }
    return [true,shader];
},

createProgram: function (vShader, fShader)
{
    var shaderProgram = gl.createProgram();
	
	gl.attachShader(shaderProgram, vShader); 
	gl.attachShader(shaderProgram, fShader); 
	gl.linkProgram(shaderProgram);           
	if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
		var errorMsg = gl.getProgramInfoLog(shaderProgram);
		//    Clean up
		gl.deleteProgram(shaderProgram);
		gl.deleteShader(vShader);
		gl.deleteShader(fShader);
		return [false, errorMsg];
	}			   
	return [true, shaderProgram];
},

enableVertexAttribArrays: function(shaderProgram)
{
    var i;
    for (i in shaderProgram.attribLocations)
    {
        gl.enableVertexAttribArray( shaderProgram.attribLocations[i] );
    }
},

disableVertexAttribArrays: function(shaderProgram)
{
    var i;
    for (i in shaderProgram.attribLocations)
    {
        gl.disableVertexAttribArray( shaderProgram.attribLocations[i] );
    }
},

createShader : function( vertexShaderCode, fragmentShaderCode, attribLocations, uniformLocations, errorOutput)
{
    var tmp = glu.compileShader( vertexShaderCode, gl.VERTEX_SHADER);
    if (!tmp[0])
    {
        if (errorOutput) {
            errorOutput.textContent = tmp[1]; }
        return null;
    }
    var vShader = tmp[1];
    tmp = glu.compileShader( fragmentShaderCode, gl.FRAGMENT_SHADER);
    if (!tmp[0])
    {
        if (errorOutput) {
            errorOutput.textContent = tmp[1]; }
        return null;
    }
    var fShader = tmp[1];
    
	tmp  = glu.createProgram( vShader, fShader);
	if (!tmp[0])
    {
        if (errorOutput) {
            errorOutput.textContent = tmp[1] + "; vShader was:" + vertexShaderCode + "; fShader was: " + fragmentShaderCode; }
        
        return null;
    }
    var shaderProgram = tmp[1];

	gl.useProgram(shaderProgram);   //    Install the program as part of the current rendering state

    shaderProgram.locations = {};
    shaderProgram.attribLocations = [];
    var i;
    var location;
    //get location of variables in shader program (to later bind them to values);
    for (i in attribLocations)
    {
        location = gl.getAttribLocation( shaderProgram, attribLocations[i]);
        shaderProgram.attribLocations.push(location);
        shaderProgram.locations[ attribLocations[i]] = location; 
    }
        
    for (i in uniformLocations)
    {
        shaderProgram.locations[ uniformLocations[i] ] = gl.getUniformLocation( shaderProgram, uniformLocations[i]); 
    }
    
    return shaderProgram;
},


createArrayBuffer : function(data)
{
	    
    var buffer = gl.createBuffer(); //    create a buffer to store our data in
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); //    Bind the buffer object to the ARRAY_BUFFER target.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); //fill the bound array buffer
	return buffer;
},

lookAt : function(yaw, pitch, translate)
{
    var yawRad = yaw / 180 * Math.PI;
    var pitchRad= pitch / 180 * Math.PI;
    var lookDir = [Math.sin( yawRad) * Math.cos(pitchRad), Math.cos(yawRad) * Math.cos( pitchRad ),  Math.sin( pitchRad)];

    var eye = [translate.x, translate.y, translate.z];
    //determine look-at point
    var lookAt = vec3.create();
    vec3.add(lookAt, eye, lookDir);

	var modelViewMatrix = mat4.create();
	mat4.lookAt(modelViewMatrix, eye,  lookAt,[0, 0, 1]);
	//mat4.translate(modelViewMatrix, modelViewMatrix, [-translate.x, -translate.y, -translate.z]);
	mat4.scale(modelViewMatrix, modelViewMatrix, [1,-1,1]);//negate y coordinate to make positive y go downward
    return modelViewMatrix;

},

init : function()
{
    glu.anisotropyExtension = gl.getExtension("EXT_texture_filter_anisotropic");
    if (glu.anisotropyExtension) {
        glu.anisotropyExtension.maxAnisotropyLevel = gl.getParameter(glu.anisotropyExtension.MAX_TEXTURE_MAX_ANISOTROPY_EXT); }

    glu.depthTextureExtension = gl.getExtension("WEBGL_depth_texture");

    /* Note: we do not actually need WEBGL_depth_texture for shadow mapping, as the current implementation 
     *       simulates depth textures by encoding depth information in RGBA channels. Rather, we use the 
     *       presence of WEBGL_depth_texture as a hint that the GPU is powerful enough to:
     *       1. support a shader precision high enough for shadow mapping
     *       2. render shadow-mapped geometry in real-time.*/
    glu.performShadowMapping = !!glu.depthTextureExtension;
    
    var format = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.MEDIUM_FLOAT);
    glu.vertexShaderMediumFloatPrecision = format.precision;
    //console.log("Shader precision: %o", precision);
},

setMaxAnisotropy : function()
{
    if (glu.anisotropyExtension === null) {
        return; }
        
    gl.texParameterf(gl.TEXTURE_2D, glu.anisotropyExtension.TEXTURE_MAX_ANISOTROPY_EXT, glu.anisotropyExtension.maxAnisotropyLevel);
},



createTexture : function(image)
{
    var texId = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
            
    gl.bindTexture(gl.TEXTURE_2D, texId);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image); //load texture data
    glu.setupTextureParameters( image.width, image.height);
   
    return texId;
},

isPowerOfTwo: function(x)
{
    if (x != x|0) return false;// not an integer
    while (x > 1)
    {
        if (x % 2 != 0) return false;
        x = x >> 1;
    }
    return (x == 1);
},

setupTextureParameters : function(width, height)
{
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // texCords are clamped 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // to range [0..1]
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);    // set zoom-in filter to linear interpolation
    
    if (glu.isPowerOfTwo(width) && glu.isPowerOfTwo(height))
    {   
        //set zoom-out filter to linear interpolation between pixels and between mipmap levels
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);    
        // automatic mipmap generation
        gl.generateMipmap(gl.TEXTURE_2D); 
        glu.setMaxAnisotropy();
        //console.log("POT texture %sx%s", width, height);
    } else
    {
        // webGL has only limited support for textures whose width and height are not powers of two:
        // those may not use automatic mipmapping, and must use the wrap mode CLAMP_TO_EDGE
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);    //set zoom-out filter to linear interpolation between pixels and between mipmap levels
        //console.log("NPOT texture %sx%s", width, height);
    }


},

createTextureFromBytes : function(bytes, width, height)
{
    if (!width)
        width = 1;
    
    if (!height)
        height = 1;
    var texId = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
            
    gl.bindTexture(gl.TEXTURE_2D, texId);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, width, height, 0, gl.RGB, gl.UNSIGNED_BYTE, bytes); //load texture data
    glu.setupTextureParameters(width, height);
  
    return texId;

},

updateTexture : function(texture, image)
{
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image); //load texture data
    glu.setupTextureParameters( image.width, image.height);
},


};

//export table for Google closure compiler

window["glu"] = glu;    
window["glu"]["compileShader"] = glu.compileShader;
window["glu"]["init"] = glu.init;
window["glu"]["createProgram"] = glu.createProgram;
window["glu"]["enableVertexAttribArrays"] = glu.enableVertexAttribArrays;
window["glu"]["disableVertexAttribArrays"] = glu.disableVertexAttribArrays;
window["glu"]["createShader"] = glu.createShader;
window["glu"]["createArrayBuffer"] = glu.createArrayBuffer;
window["glu"]["lookAt"] = glu.lookAt;
window["glu"]["init"] = glu.init;
window["glu"]["setMaxAnisotropy"] = glu.setMaxAnisotropy;
window["glu"]["createTexture"] = glu.createTexture;
window["glu"]["createTextureFromBytes"] = glu.createTextureFromBytes;
window["glu"]["updateTexture"] = glu.updateTexture;
window["glu"]["createNpotTexture"] = glu.createNpotTexture;

