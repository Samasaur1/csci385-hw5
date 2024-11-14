function loadShader(type, source) {
    let shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        let errors = gl.getShaderInfoLog(shader);
	alert('Shader failed to compile: ' + errors)
	gl.deleteShader(shader);
    }
    return shader;
}

function loadShaderProgram(vsSrc, fsSrc) {
    let vs = loadShader(gl.VERTEX_SHADER, vsSrc);
    let fs = loadShader(gl.FRAGMENT_SHADER, fsSrc);
    let shdrPrgm = gl.createProgram();
    gl.attachShader(shdrPrgm, vs)
    gl.attachShader(shdrPrgm, fs);
    gl.linkProgram(shdrPrgm);
    if (!gl.getProgramParameter(shdrPrgm, gl.LINK_STATUS)) {
        let errors = gl.getProgramInfoLog(shdrPrgm);
	alert('Shader failed to link: ' + errors)
	alert("Failed to initialize shader program.")
    }
    return shdrPrgm
}
