
glu = {};

glu.compileShader = function (src_str, type)
{
    var shader = gl.createShader(type); //create abstract shader object
    gl.shaderSource(shader, src_str);   //set its GLSL source
    gl.compileShader(shader);           //Compile it
    //    Check for errors
    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        //console.log("Couldn't compile the shader: " + gl.getShaderInfoLog(shader) );
        //    Clean up
        var errorMsg = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        return [false, "Couldn't compile the shader: " + errorMsg + "\nSource is: " + src_str];
    }
    return [true,shader];
}

glu.createProgram = function (vShader, fShader)
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
}

glu.createShader = function( vertexShaderCode, fragmentShaderCode, attribLocations, uniformLocations, errorOutput)
{
    var tmp = glu.compileShader( vertexShaderCode, gl.VERTEX_SHADER);
    if (!tmp[0])
    {
        if (errorOutput)
            errorOutput.textContent = tmp[1];
        return null;
    }
    var vShader = tmp[1];
    var tmp = glu.compileShader( fragmentShaderCode, gl.FRAGMENT_SHADER);
    if (!tmp[0])
    {
        if (errorOutput)
            errorOutput.textContent = tmp[1];
        return null;
    }
    var fShader = tmp[1];
    
	var tmp  = glu.createProgram( vShader, fShader);
	if (!tmp[0])
    {
        if (errorOutput)
            errorOutput.textContent = tmp[1] + "; vShader was:" + vertexShaderCode + "; fShader was: " + fragmentShaderCode;
        
        return null;
    }
    var shaderProgram = tmp[1];

	gl.useProgram(shaderProgram);   //    Install the program as part of the current rendering state

    shaderProgram.locations = {};

    //get location of variables in shader program (to later bind them to values);
    for (var i in attribLocations)
        shaderProgram.locations[ attribLocations[i]] = gl.getAttribLocation( shaderProgram, attribLocations[i]); 
        
    for (var i in uniformLocations)
        shaderProgram.locations[ uniformLocations[i] ] = gl.getUniformLocation( shaderProgram, uniformLocations[i]); 
    
    return shaderProgram;
}


glu.createArrayBuffer = function(data)
{
	    
    var buffer = gl.createBuffer(); //    create a buffer to store our data in
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); //    Bind the buffer object to the ARRAY_BUFFER target.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); //fill the bound array buffer
	return buffer;
}

glu.lookAt = function(yaw, pitch, translate)
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

}

glu.init = function()
{
    glu.anisotropyExtension = gl.getExtension("EXT_texture_filter_anisotropic");
    if (glu.anisotrophyExtension)
        glu.anisotropyExtension.MAX_TEXTURE_MAX_ANISOTROPY_EXT = gl.getParameter(glu.anisotropyExtension.MAX_TEXTURE_MAX_ANISOTROPY_EXT);

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
}

glu.setMaxAnisotropy = function()
{
    if (glu.anisotropyExtension == null)
        return;
        
    gl.texParameterf(gl.TEXTURE_2D, glu.anisotropyExtension.TEXTURE_MAX_ANISOTROPY_EXT, glu.anisotropyExtension.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
}



glu.createTexture = function(image)
{
    var texId = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
            
    gl.bindTexture(gl.TEXTURE_2D, texId);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image); //load texture data
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);                  //set zoom-in filter to linear interpolation
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);    //set zoom-out filter to linear interpolation between pixels and between mipmap levels
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // texCords are clamped 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // to range [0..1]
    gl.generateMipmap(gl.TEXTURE_2D);                                     // automatic mipmap generation
    
    glu.setMaxAnisotropy();
    
    return texId;
}

glu.createTextureFromBytes = function(bytes)
{
    var texId = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
            
    gl.bindTexture(gl.TEXTURE_2D, texId);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, bytes); //load texture data
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);                  //set zoom-in filter to linear interpolation
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);    //set zoom-out filter to linear interpolation between pixels and between mipmap levels
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // texCords are clamped 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // to range [0..1]
    gl.generateMipmap(gl.TEXTURE_2D);                                     // automatic mipmap generation
    
    glu.setMaxAnisotropy();
    
    return texId;

}

glu.updateTexture = function(texture, image)
{
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image); //load texture data
    gl.generateMipmap(gl.TEXTURE_2D);                                     // automatic mipmap generation
    glu.setMaxAnisotropy();
}



// webGL has only limited support for textures whose width and height are not powers of two:
// those may not use automatic mipmapping, and must use the warp mode CLAMP_TO_EDGE
glu.createNpotTexture = function(image)
{
    var texId = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
            
    gl.bindTexture(gl.TEXTURE_2D, texId);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image); //load texture data
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);                  //set zoom-in filter to linear interpolation
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);    //set zoom-out filter to linear interpolation between pixels and mipmap levels
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // texCords are clamped 
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // to range [0..1]
    
    return texId;
}
