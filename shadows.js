"use strict"

/* Copyright (c) 2014, Robert Buchholz <rbuch703@gmail.com> 
   The contents of this file are licensed under the GNU General Public License version 3
   (see the LICENSE file in the project root for details)
*/

var Shadows = {
    
    dirty: true,
    depthTextureSize : 2048, //according to webglstats.com, a texture size of 2048² is supported virtually everywhere
    
    init: function()
    {
        if (! glu.performShadowMapping)
            return;
        Shadows.shadowMvpMatrix = mat4.create();

        // Create a color texture for use with the depth shader
        Shadows.colorTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, Shadows.colorTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Shadows.depthTextureSize, Shadows.depthTextureSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        // Create the depth texture
        /*Shadows.depthTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, Shadows.depthTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, Shadows.depthTextureSize, Shadows.depthTextureSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);*/
        
        //render buffers are more efficient than rendering to textures, because they need not be in a format that
        //can be sampled (like a texture) later. Since we throw away the depth buffer after the depth is rendered
        //to the color texture via the depth shader, using a render buffer as a depth buffer is preferred
        Shadows.renderbuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, Shadows.renderbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, Shadows.depthTextureSize, Shadows.depthTextureSize);

        Shadows.framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, Shadows.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, Shadows.colorTexture, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, Shadows.renderbuffer);        
        
        //gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, Shadows.depthTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    },

    renderDepthTexture: function( sunPosition, lookAtPosition, sceneObjects)
    {
        if (! Shadows.dirty)
            return;

        if (! glu.performShadowMapping)
            return;
        
        Shadows.dirty = false;
        //the sun is the camera for this render pass, so we cannot render without knowing its position
        if (!sunPosition)
            return;

        //use created texture-backed framebuffer as render target (and not the default buffer that is output to screen)
        gl.bindFramebuffer(gl.FRAMEBUFFER, Shadows.framebuffer);
        
        //gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0);
        //gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
		
		//If the Sun is below the horizon, nothing is lit by the Sun.
		//The cleared depth buffer causes exactly that without having to render the frame
		if (sunPosition[2] < 0)
		{
    		gl.clearDepth(-1.0);
		    gl.clear( gl.DEPTH_BUFFER_BIT );
    		gl.clearDepth(1.0);
		    return;
	    }

		gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
		    
		gl.viewport(0, 0, Shadows.depthTextureSize, Shadows.depthTextureSize);

        var modelViewMatrix = mat4.create();
        var pos = [sunPosition[0], -sunPosition[1], sunPosition[2]];
        mat4.lookAt(modelViewMatrix, pos, lookAtPosition, [0,0,1]);
    	mat4.scale(modelViewMatrix, modelViewMatrix, [1,-1,1]);//negate y coordinate to make positive y go downward
	    var projectionMatrix = mat4.create();
	    mat4.perspective(projectionMatrix, fieldOfView/180*Math.PI/300, webGlCanvas.width / webGlCanvas.height, 3000, 5100.0);

        // is later needed to index the shadow buffer
        Shadows.shadowMvpMatrix = mat4.create();
        mat4.mul(Shadows.shadowMvpMatrix, projectionMatrix, modelViewMatrix);


        for (var i in sceneObjects)
            if (sceneObjects[i])
                sceneObjects[i].renderDepth(modelViewMatrix, projectionMatrix);
       
    }


};
