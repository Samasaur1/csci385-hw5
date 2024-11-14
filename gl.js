let gl = document.querySelector('#glcanvas').getContext('webgl');;
if (!gl) {
    alert('Unable to initialize WebGL.')
}
