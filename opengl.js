
// Unused, but available for compatability.
const GLUT_SINGLE = 0;
const GLUT_RGB = 0;
const GLUT_DEPTH = 0;

// Mouse button constants.
const GLUT_UP = 0;
const GLUT_DOWN = 1;
const GLUT_LEFT_BUTTON = 0;
const GLUT_MIDDLE_BUTTON = 1;
const GLUT_RIGHT_BUTTON = 2;

// Alpha blending configuration constants.
const GL_SRC_ALPHA = gl.SRC_ALPHA;
const GL_ONE_MINUS_SRC_ALPHA = gl.ONE_MINUS_SRC_ALPHA;

// OpenGL rendering modes. Rely on WebGL analogues.
const GL_BLEND = gl.BLEND;
const GL_CULL_FACE = gl.CULL_FACE;
const GL_DEPTH_TEST = gl.DEPTH_TEST;
const GL_DITHER = gl.DITHER;
const GL_POLYGON_OFFSET_FILL = gl.POLYGON_OFFSET_FILL;
const GL_SAMPLE_ALPHA_TO_COVERAGE = gl.SAMPLE_ALPHA_TO_COVERAGE;
const GL_SAMPLE_COVERAGE = gl.SAMPLE_COVERAGE;
//
const GL_COLOR_BUFFER_BIT = gl.COLOR_BUFFER_BIT;
const GL_DEPTH_BUFFER_BIT = gl.DEPTH_BUFFER_BIT;

// Old OpenGL constants, now defunct in WebGL. Used to
// enable Phong shading and to configure a single light
// in the scene.
const GL_LIGHTING = 1001; // What to set this to???
const GL_LIGHT0   = 1002;
const GL_POSITION = 1003;

// Used for the world/canvas transformations.
const GL_PROJECTION = 0;
const GL_MODELVIEW  = 1;
const GL_VIEWPORT = gl.VIEWPORT;
const GL_PROJECTION_MATRIX = GL_PROJECTION;
const GL_MODELVIEW_MATRIX = GL_MODELVIEW;

// Different geometric primitives that can be sent to GLSL.
const GL_LINES = gl.LINES;
const GL_TRIANGLES = gl.TRIANGLES;
const GL_TRIANGLE_STRIP = gl.TRIANGLE_STRIP;
const GL_TRIANGLE_FAN = gl.TRIANGLE_FAN;

// For restricting the rendering region.
const GL_SCISSOR_TEST = gl.SCISSOR_TEST;

//
// The global GL rendering context we invent and use for this library.
// (See glInit function for details)
//
const _GL = {};

//
// Used as a map of (filenames -> their text) for asyncronously loading
// files within the browser.
//
_GLresources = new Map();

async function _glLoadResource(resourceFileName) {
    const response = await fetch(resourceFileName);
    const text     = await response.text();
    _GLresources.set(resourceFileName,text);
}

async function _glLoadEachResource(resources) {
    for (let resource of resources) {
        const result = await _glLoadResource(resource);
    }
}

async function _glLoadEachSource(sources) {
    for (let src of sources) {
	let text = document.getElementById(src).text;
	_GLresources.set(src,text);
    }
}


//
// OPENGL Library public interface starts here.
//
async function glRun(mainFunction, embedded=false) {
    shaderSrcs = ["glsl/vs-uniform-color.c",
		  "glsl/vs-varying-color.c",
		  "glsl/fs-color.c",
		  "glsl/vs-uniform-material.c",
		  "glsl/vs-varying-material.c",
		  "glsl/fs-phong.c"
		 ];
	
    // Load the shader source code text.
    if (embedded) {
	_glLoadEachSource(shaderSrcs);
    } else {
	const done = await _glLoadEachResource(shaderSrcs);
    }
    glInit();
    mainFunction();
}

function glInit() {
    // Initialize the shaders.
    _GL.shaders = {};
    _GL.shaders.uniformColor    = _GLinitUniformColorShader();
    _GL.shaders.varyingColor    = _GLinitVaryingColorShader();
    _GL.shaders.uniformMaterial = _GLinitUniformMaterialShader();
    _GL.shaders.varyingMaterial = _GLinitVaryingMaterialShader();

    // Initialize GLUT info.
    _GL.keyboardFunc =      ((key,x,y) => {});
    _GL.displayFunc =       (() => {});
    _GL.reshapeFunc =       ((w,h) => {});
    _GL.mouseFunc =         ((b,s,x,y) => {});
    _GL.motionFunc =        ((x,y) => {});
    _GL.passiveMotionFunc = ((x,y) => {});
    
    // Initialize ransformation state.
    _GL.matrixStack = [ [] , [] ];
    _GL.matrix =      [ mat4.create(), mat4.create() ];
    _GL.matrixMode =  GL_PROJECTION;

    // Initialize color and material state.
    _GL.color             =     [1.0, 1.0, 1.0, 1.0];
    _GL.materialDiffuse   =     1.0;
    _GL.materialSpecular  =     0.6;
    _GL.materialShininess =     20;

    // Initialize lighting and shading state.
    _GL.ambientColor   = [0.2, 0.2, 0.3, 1.0];
    _GL.lighting       = false;
    _GL.light0         = false;
    _GL.light0Position = [0.0, 0.0,-1.0, 1.0];
    _GL.light0Color    = [0.8, 0.8, 0.8, 1.0];
    //
    _GL.normal = [0.0, 0.0, 1.0, 0.0];
    
    // Initialize glBegin/End recordings.
    _GL.recordings = new Map();
    _GLresetRecording();

    // Handle resize events.
    //window.addEventListener('resize', _GLresizeCanvas, false);

    // Mouse state,
    _GL.mousex = 0;
    _GL.mousey = 0;
    _GL.mousedown = false;
    
    // Handle canvas interaction events.
    const canvas = document.getElementById('glcanvas');
    window.addEventListener('keydown',   _GLkeydown);
    canvas.addEventListener('mousemove', _GLmousemove);
    canvas.addEventListener('mousedown', _GLmousedown);
    canvas.addEventListener('mouseup',   _GLmouseup);
    canvas.addEventListener('touchmove', _GLtouchmove);
    canvas.addEventListener('touchstart', _GLtouchstart);
    canvas.addEventListener('touchend',   _GLtouchend);
    canvas.addEventListener('touchcancel',   _GLtouchend);
}

function _GLresizeCanvas() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const canvas = document.getElementById('glcanvas');
    canvas.width = w-20;
    canvas.height = h-50;
    _GL.reshapeFunc(w-20,h-50);
}

function glButtonAsKey(key) {
    _GL.keyboardFunc(key, _GL.mousex, _GL.mousey);
}    

function _GLkeydown(event) {
    const fromCode = String.fromCharCode(event.keyCode);
    const key = fromCode.toLowerCase();
    _GL.keyboardFunc(key, _GL.mousex, _GL.mousey);
}

function _GLmousemove(event) {
    event.preventDefault();
    _GL.mousex = event.pageX;
    _GL.mousey = event.pageY;
    if (_GL.mousedown) {
	_GL.motionFunc(event.pageX, event.pageY);
    } else {
	_GL.passiveMotionFunc(event.pageX, event.pageY);
    }
}

function _GLmousedown(event) {
    event.preventDefault();
    _GL.mousex = event.pageX;
    _GL.mousey = event.pageY;
    _GL.mousedown = true;
    _GL.mousebutton = GLUT_LEFT_BUTTON;
    if (event.shiftKey) {
	_GL.mousebutton = GLUT_MIDDLE_BUTTON;
    }
    _GL.mouseFunc(_GL.mousebutton,
		  GLUT_DOWN,
		  event.pageX, event.pageY);
}

function _GLmouseup(event) {
    event.preventDefault();
    _GL.mousex = event.pageX;
    _GL.mousey = event.pageY;
    _GL.mousedown = false;
    _GL.mouseFunc(_GL.mousebutton,
		  GLUT_UP,
		  event.pageX, event.pageY);
}

function _GLtouchmove(event) {
    if (event.touches.length == 1) {
	event.preventDefault();
	_GL.mousex = event.touches[0].pageX;
	_GL.mousey = event.touches[0].pageY;
	if (_GL.mousedown) {
	    _GL.motionFunc(_GL.mousex, _GL.mousey);
	} else {
	    _GL.passiveMotionFunc(_GL.mousex, _GL.mousey);
	}
    }
}

function _GLtouchstart(event) {
    if (event.touches.length == 1) {
	event.preventDefault();
	_GL.mousex = event.touches[0].pageX;
	_GL.mousey = event.touches[0].pageY;
	_GL.mousedown = true;
	_GL.mousebutton = GLUT_LEFT_BUTTON;
	_GL.mouseFunc(_GL.mousebutton, GLUT_DOWN,
		      _GL.mousex, _GL.mousey);
    }
}

function _GLtouchend(event) {
    if (event.touches.length >= 1) {
	event.preventDefault();
	_GL.mousex = event.touches[0].pageX;
	_GL.mousey = event.touches[0].pageY;
	_GL.mousedown = false;
	_GL.mousebutton = GLUT_LEFT_BUTTON;
	_GL.mouseFunc(_GL.mousebutton, GLUT_UP,
		      _GL.mousex, _GL.mousey);
    }
}

function _GLinitUniformColorShader() {
    // Get vertex and fragment shader programs.
    const vsSource = _GLresources.get("glsl/vs-uniform-color.c");
    const fsSource = _GLresources.get("glsl/fs-color.c");
    
    // Initialize shader programs and variable information.
    let shdrPrgm = loadShaderProgram(vsSource,fsSource);
    let shdrInfo = {
	program: shdrPrgm,
	aVertexPosition: gl.getAttribLocation(shdrPrgm,'aVertexPosition'),
	uProjectionMatrix: gl.getUniformLocation(shdrPrgm,'uProjectionMatrix'),
	uModelViewMatrix: gl.getUniformLocation(shdrPrgm,'uModelViewMatrix'),
	uColor: gl.getUniformLocation(shdrPrgm,'uColor')
    }
    return shdrInfo;
}

function _GLinitVaryingColorShader() {
    // Get vertex and fragment shader programs.
    const vsSource = _GLresources.get("glsl/vs-varying-color.c");
    const fsSource = _GLresources.get("glsl/fs-color.c");
    
    // Initialize shader programs and variable information.
    let shdrPrgm = loadShaderProgram(vsSource,fsSource);
    let shdrInfo = {
	program: shdrPrgm,
	aVertexPosition: gl.getAttribLocation(shdrPrgm,'aVertexPosition'),
	aVertexColor: gl.getAttribLocation(shdrPrgm,'aVertexColor'),
	uProjectionMatrix: gl.getUniformLocation(shdrPrgm,'uProjectionMatrix'),
	uModelViewMatrix: gl.getUniformLocation(shdrPrgm,'uModelViewMatrix'),
    }
    return shdrInfo;
}

function _GLinitUniformMaterialShader() {
    // Get vertex and fragment shader programs.
    const vsSource = _GLresources.get("glsl/vs-uniform-material.c");
    const fsSource = _GLresources.get("glsl/fs-phong.c");
    
    // Initialize shader programs and variable information.
    let shdrPrgm = loadShaderProgram(vsSource,fsSource);
    let shdrInfo = { program: shdrPrgm };
    _GLinitMaterialShader(shdrInfo);
    shdrInfo.uMaterialColor =
	gl.getUniformLocation(shdrPrgm,'uMaterialColor');
    
    return shdrInfo;
}

function _GLinitVaryingMaterialShader() {
    // Get vertex and fragment shader programs.
    const vsSource = _GLresources.get("glsl/vs-varying-material.c");
    const fsSource = _GLresources.get("glsl/fs-phong.c");
    
    // Initialize shader programs and variable information.
    let shdrPrgm = loadShaderProgram(vsSource,fsSource);
    let shdrInfo = { program: shdrPrgm };
    _GLinitMaterialShader(shdrInfo);
    shdrInfo.aVertexMaterial =
	gl.getAttribLocation(shdrPrgm,'aVertexMaterial');
    return shdrInfo;
}

function _GLinitMaterialShader(shdrInfo) {
    shdrPrgm = shdrInfo.program;
    
    // Vertex attribute locations.
    shdrInfo.aVertexPosition =
	gl.getAttribLocation(shdrPrgm,'aVertexPosition');
    shdrInfo.aVertexNormal = 
	gl.getAttribLocation(shdrPrgm,'aVertexNormal');
    
    // Uniform locations. 
    shdrInfo.uProjectionMatrix =
	gl.getUniformLocation(shdrPrgm,'uProjectionMatrix');
    shdrInfo.uModelViewMatrix =
	gl.getUniformLocation(shdrPrgm,'uModelViewMatrix');
    // 
    shdrInfo.uAmbientColor =
	gl.getUniformLocation(shdrPrgm,'uAmbientColor');
    //
    shdrInfo.uLight0Color =
	gl.getUniformLocation(shdrPrgm,'uLight0Color');
    shdrInfo.uLight0Position =
	gl.getUniformLocation(shdrPrgm,'uLight0Position');
    shdrInfo.uLight0Enabled =
	gl.getUniformLocation(shdrPrgm,'uLight0Enabled');
    //
    shdrInfo.uMaterialDiffuse =
	gl.getUniformLocation(shdrPrgm,'uMaterialDiffuse');
    shdrInfo.uMaterialSpecular =
	gl.getUniformLocation(shdrPrgm,'uMaterialSpecular');
    shdrInfo.uMaterialShininess =
	gl.getUniformLocation(shdrPrgm,'uMaterialShininess');
}

function _GLresetRecording(saveColors = false) {
    _GL.recording = null;
    _GL.points =  [];
    _GL.normals = [];
    _GL.colors =  [];
    _GL.size = 0;
    _GL.saveColors = saveColors;
}

function _GLassertRecording() {
    console.assert(_GL.recording != null,
		   "OpenGL: Attempt to operate outside glBegin/End.");
}
	
function _GLassertNotRecording() {
    console.assert(_GL.recording == null,
		   "OpenGL: Attempt to operate within glBegin/End.");
}

function glutKeyboardFunc(keyPressHandler) {
    _GL.keyboardFunc = keyPressHandler;
}

function glutDisplayFunc(displayHandler) {
    _GL.displayFunc = displayHandler;
}

function glutReshapeFunc(reshapeHandler) {
    _GL.reshapeFunc = reshapeHandler;
}

function glutMouseFunc(mouseHandler) {
    _GL.mouseFunc = mouseHandler;
}

function glutMotionFunc(motionHandler) {
    _GL.motionFunc = motionHandler;
}

function glutPassiveMotionFunc(passiveMotionHandler) {
    _GL.passiveMotionFunc = passiveMotionHandler;
}

function glutPostRedisplay() {
    const render = ((ignore) => {
	_GL.displayFunc();
    })
    requestAnimationFrame(render);
}

function glutMainLoop() {
    const loop = ((time_in_msecs) => {
	_GL.displayFunc();
	glutMainLoop();
    })
    requestAnimationFrame(loop);
}

function glGetFloatv(parameter, m) {
    const check =
	  (parameter == GL_MODELVIEW_MATRIX)
	  || (parameter == GL_PROJECTION_MATRIX)
    console.assert(check, "Cannot read that GL parameter.");
    if (parameter == GL_MODELVIEW_MATRIX) {
	mat4.copy(m,_GL.matrix[GL_MODELVIEW]);
    } else {
	mat4.copy(m,_GL.matrix[GL_PROJECTION]);
    }
}

function glGetIntegerv(parameter, array) {
    console.assert(parameter == GL_VIEWPORT,
		   "Caannot read that GL parameter.");
    const v = gl.getParameter(parameter);
    for (let i = 0; i < v.length; i++) {
	array[i] = v[i];
    }
}

function glBegin(what, name, saveColors = false) {
    _GLassertNotRecording();
    
    const makeSure =
	  (what == GL_TRIANGLES)
	  || (what == GL_TRIANGLE_STRIP)
	  || (what == GL_TRIANGLE_FAN)
	  || ((what == GL_LINES) && !saveColors);
    console.assert(makeSure);
    
    _GL.recording = {name:name,
		     mode:what,
		     size:null,
		     vertexBuffer:null,
		     normalBuffer:null,
		     colorsBuffer:null
		    };
    _GL.saveColors = saveColors;
}

function glVertex3f(x, y, z) {
    _GLassertRecording();
    glVertex3fv([x,y,z]);
}

function glVertex3fv(p) {
    _GLassertRecording();

    // Save vertex location.
    _GL.points.push(p[0]);
    _GL.points.push(p[1]);
    _GL.points.push(p[2]);
    _GL.points.push(1.0);
    
    // Save current normal.
    _GL.normals.push(_GL.normal[0]);
    _GL.normals.push(_GL.normal[1]);
    _GL.normals.push(_GL.normal[2]);
    _GL.normals.push(_GL.normal[3]);

    // Save color info, if enabled.
    if (_GL.saveColors) {
	_GL.colors.push(_GL.color[0]);
	_GL.colors.push(_GL.color[1]);
	_GL.colors.push(_GL.color[2]);
	_GL.colors.push(_GL.color[3]);
    }
    _GL.size++;
}

function glNormal3f(dx, dy, dz) {
    //_GLassertRecording();
    glNormal3fv([dx, dy, dz]);
}

function glNormal3fv(v) {
    //_GLassertRecording();
    _GL.normal = [v[0], v[1], v[2], 0.0];
}

function glColor3f(r, g, b) {
    //_GLassertRecording();
    _GL.color = [r, g, b, 1.0];
}

function glColor4f(r, g, b, a) {
    //_GLassertRecording();
    _GL.color = [r, g, b, a];
}

function glEnd() {
    _GLassertRecording();

    // Make the vertex array buffer; save its index.
    const vbuf = gl.createBuffer();
    _GL.recording.vertexBuffer = vbuf;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
    const points = new Float32Array(_GL.points);
    gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);

    // Make the normal array buffer; save its index.
    const nbuf = gl.createBuffer();
    _GL.recording.normalBuffer = nbuf;
    gl.bindBuffer(gl.ARRAY_BUFFER, nbuf);
    const normals = new Float32Array(_GL.normals);
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);

    if (_GL.saveColors) {
	// Make the vertex array buffer; save its index.
	const cbuf = gl.createBuffer();
	_GL.recording.colorsBuffer = cbuf;
	gl.bindBuffer(gl.ARRAY_BUFFER, cbuf);
	const colors = new Float32Array(_GL.colors);
	gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    }

    // Save the size of each.
    _GL.recording.size = _GL.size;
    
    // Save the recording.
    _GL.recordings.set(_GL.recording.name, _GL.recording);

    // Reset the recorder state.
    _GLresetRecording();
}

function _glRenderMaterial(shader, recording) {
    //
    // Set up uniform...
    //
    // ...transforms.
    gl.uniformMatrix4fv(shader.uProjectionMatrix, false,
			_GL.matrix[GL_PROJECTION]);
    gl.uniformMatrix4fv(shader.uModelViewMatrix, false,
			_GL.matrix[GL_MODELVIEW]);
    //
    // ...light0 and ambient light info.
    gl.uniform4fv(shader.uAmbientColor,   _GL.ambientColor);
    gl.uniform4fv(shader.uLight0Color,    _GL.light0Color);
    gl.uniform4fv(shader.uLight0Position, _GL.light0Position);
    if (_GL.light0) {
	gl.uniform1i(shader.uLight0Enabled, 1);
    } else {
	gl.uniform1i(shader.uLight0Enabled, 0);
    }
    //
    // ...material info.
    gl.uniform1f(shader.uMaterialDiffuse,   _GL.materialDiffuse);
    gl.uniform1f(shader.uMaterialSpecular,  _GL.materialSpecular);
    gl.uniform1f(shader.uMaterialShininess, _GL.materialShininess);
    
    //
    // Set up per-vertex buffers.
    const size = recording.size;
    //
    const vbuf = recording.vertexBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
    gl.vertexAttribPointer(shader.aVertexPosition,
			   4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shader.aVertexPosition);
    //
    const nbuf = recording.normalBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, nbuf);
    gl.vertexAttribPointer(shader.aVertexNormal,
			   4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shader.aVertexNormal);
    
    //
    //
    // Render using those vertex attributes!!
    gl.drawArrays(recording.mode, 0, size);
    
    //
    // Disable buffers.
    gl.disableVertexAttribArray(shader.aVertexPosition);
    gl.disableVertexAttribArray(shader.aVertexNormal);
}
    
function _glRenderVaryingMaterial(recording) {
    const shader = _GL.shaders.varyingMaterial;
    gl.useProgram(shader.program);
    
    // Set up the per-vertex color buffer.
    const cbuf = recording.colorsBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, cbuf);
    gl.vertexAttribPointer(shader.aVertexMaterial,
			   4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shader.aVertexMaterial);

    // Render!
    _glRenderMaterial(shader,recording);

    // Disable the per-vertex color buffer.
    gl.disableVertexAttribArray(shader.aVertexMaterial);
}

function _glRenderUniformMaterial(recording) {
    const shader = _GL.shaders.uniformMaterial;
    gl.useProgram(shader.program);
    
    // Set up the uniform material coloe.
    gl.uniform4fv(shader.uMaterialColor,_GL.color);

    // Render!
    _glRenderMaterial(shader,recording);
}

function _glRenderUniformColor(recording) {
    const shader = _GL.shaders.uniformColor;
    //
    // Set up uniforms.
    gl.useProgram(shader.program);
    gl.uniformMatrix4fv(shader.uProjectionMatrix,
			false,
			_GL.matrix[GL_PROJECTION]);
    gl.uniformMatrix4fv(shader.uModelViewMatrix,
			false,
			_GL.matrix[GL_MODELVIEW]);
    gl.uniform4fv(shader.uColor, _GL.color);
    //
    // Enable buffers.
    const size = recording.size;
    const buff = recording.vertexBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buff);
    gl.vertexAttribPointer(shader.aVertexPosition,
			   4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shader.aVertexPosition);
    //
    // Render the vertices.
    gl.drawArrays(recording.mode, 0, size);
    //
    // Disable buffers.
    gl.disableVertexAttribArray(shader.aVertexPosition);
}

function _glRenderVaryingColor(recording) {
    const shader = _GL.shaders.varyingColor;
    //
    // Set up uniforms.
    gl.useProgram(shader.program);
    gl.uniformMatrix4fv(shader.uProjectionMatrix,
			false,
			_GL.matrix[GL_PROJECTION]);
    gl.uniformMatrix4fv(shader.uModelViewMatrix,
			false,
			_GL.matrix[GL_MODELVIEW]);
    //
    // Enable buffers.  
    const size = recording.size;
    const vbuf = recording.vertexBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
    gl.vertexAttribPointer(shader.aVertexPosition,
			   4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shader.aVertexPosition);
    //
    const cbuf = recording.colorsBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, cbuf);
    gl.vertexAttribPointer(shader.aVertexColor,
			   4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shader.aVertexColor);
    //
    // Render the vertices.
    gl.drawArrays(recording.mode, 0, size);
    //
    // Disable buffers.
    gl.disableVertexAttribArray(shader.aVertexColor);
}
    
function glBeginEnd(name) {
    _GLassertNotRecording();
    console.assert(_GL.recordings.has(name),`No such object "${name}".`);
    const recording = _GL.recordings.get(name);
    if (_GL.lighting && recording.mode != GL_LINES) {
	if (recording.colorsBuffer == null) {
	    _glRenderUniformMaterial(recording);
	} else {
	    _glRenderVaryingMaterial(recording);
	}
    } else {
	if (recording.colorsBuffer == null) {
	    _glRenderUniformColor(recording);
	} else {
	    _glRenderVaryingColor(recording);
	}
    }
}

function glClearColor(r, g, b, a) {
    gl.clearColor(r, g, b, a);
}

function glClearColor(r, g, b, a) {
    gl.clearColor(r, g, b, a);
}

function glClearDepth(amount) {
    gl.clearDepth(amount); // I've only used 1.0. Doc says 0.0-1.0
}

function glClear(options) {
    gl.enable(gl.DEPTH_TEST);           // Enable depth testing
    gl.depthFunc(gl.LEQUAL);            // Near obscures far
    gl.clear(options);
}

function glFlush() {
    console.assert(_GL.matrixStack[GL_MODELVIEW].length == 0,
		   "Leftover matrix data on GL_MODELVIEW stack.");
    console.assert(_GL.matrixStack[GL_PROJECTION].length == 0,
		   "Leftover matrix data on GL_PROJECTION stack.");
}

function glLoadIdentity() {
    _GL.matrix[_GL.matrixMode] = mat4.create();
}

function glMatrixMode(mode) {
    _GLassertNotRecording();
    const checkMatrix =
	  (mode == GL_PROJECTION)
	  || (mode == GL_MODELVIEW);
    console.assert(checkMatrix,"OpenGL: Unsupported matrix mode.");
    _GL.matrixMode = mode;
}

function glPushMatrix() {
    const clone = mat4.clone(_GL.matrix[_GL.matrixMode]);
    _GL.matrixStack[_GL.matrixMode].push(clone);
}

function glPopMatrix() {
    console.assert(_GL.matrixStack[_GL.matrixMode].length > 0,
		   "OpenGL: Popping an empty matrix stack.")
    _GL.matrix[_GL.matrixMode] = _GL.matrixStack[_GL.matrixMode].pop();
}

function glRotatef(angle, axis_x, axis_y, axis_z) {
    const radians = angle * Math.PI / 180.0;
    mat4.rotate(_GL.matrix[_GL.matrixMode],
		_GL.matrix[_GL.matrixMode],
		radians, [axis_x, axis_y, axis_z]);
}

function glScalef(sx, sy, sz) {
    mat4.scale(_GL.matrix[_GL.matrixMode],
	       _GL.matrix[_GL.matrixMode],
	       [sx, sy, sz]);
}

function glTranslatef(tx, ty, tz) {
    mat4.translate(_GL.matrix[_GL.matrixMode],
		   _GL.matrix[_GL.matrixMode],
		   [tx, ty, tz]);
}

function glOrtho(left, right, bottom, top, near, far) {
    const m = mat4.create();
    mat4.ortho(m, left, right, bottom, top, near, far);
    mat4.multiply(_GL.matrix[_GL.matrixMode],
		  _GL.matrix[_GL.matrixMode],m);
}

function gluPerspective(fovy, aspect, zNear, zFar) {
    const m = mat4.create();
    mat4.perspective(m, fovy, aspect, zNear, zFar);
    mat4.multiply(_GL.matrix[_GL.matrixMode],
		  _GL.matrix[_GL.matrixMode],m);
}


function gluLookAt(eye, center, up) {
    const m = mat4.create();
    const e = vec3.fromValues(eye.x, eye.y, eye.z);
    const c = vec3.fromValues(center.x, center.y, center.z);
    const u = vec3.fromValues(up.dx, up.dy, up.dz);
    mat4.lookAt(m, e, c, u);
    mat4.multiply(_GL.matrix[_GL.matrixMode],
		  _GL.matrix[_GL.matrixMode],m);
}

function glLightfv(which, what, values) {
    if (which == GL_LIGHT0 && what == GL_POSITION) {
	if (values.length == 3) {
	    _GL.light0Position = values.concat([1.0]);
	} if (values.length == 4) {
	    _GL.light0Position = values;
	}
    }
}
function glEnable(mode) {
    if (mode == GL_LIGHTING) {
	_GL.lighting = true;
	return;
    }
    if (mode == GL_LIGHT0) {
	_GL.light0 = true;
	return;
    }
    gl.enable(mode);
}

function glDisable(mode) {
    if (mode == GL_LIGHTING) {
	_GL.lighting = false
	return;
    }
    if (mode == GL_LIGHT0) {
	_GL.light0 = false;
	return;
    }
    gl.disable(mode);
}

function glBlendFunc(arg1, arg2) {
    gl.blendFunc(arg1, arg2);
}

function glViewport(top, left, bottom, right) {
    gl.viewport(top, left, bottom, right);
}

function glScissor(cornerx, cornery, width, height) {
    gl.scissor(cornerx, cornery, width, height);
}



function glutInitDisplayMode(ignored_option_bits) {
    // WebGL doesn't require that you set up the canvas with these modes.
}

function glutInitWindowPosition(ignored_left, ignored_top) {
    // Can't do this in HTML/Javascript AFAIK.
}

function glutInitWindowSize(w,h) {
    const canvas = document.getElementById('glcanvas');
    canvas.width = w;
    canvas.height = h;
}

function glutCreateWindow(title) {
    const canvas = document.getElementById('glcanvas');
    canvas.removeAttribute("hidden");
    document.title = title;
}
