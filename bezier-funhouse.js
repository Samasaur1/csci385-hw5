//
// room-funhouse.js
//
// Author: Jim Fix
// CSCI 385: Computer Graphics, Reed College, Spring 2022
//
// Editor that allows its user to construct a scene consisting of some
// spheres and a mirrored surface. It renders a 3D view of the scene
// using hardware-accelerated ray tracing.
// 

gTraceShader = null;

// Support for the sphere material library.
//
const INITIAL_COLOR_NAME = "adriatic" // Starting color for a placed sphere.
//
const gColorLibrary = new Map();
gColorLibrary.set('adriatic',{r:0.125,g:0.25,b:0.375});
gColorLibrary.set('travertine',{r:0.60,g:0.57,b:0.52});
gColorLibrary.set('jade',{r:0.18,g:0.38,b:0.27});
gColorLibrary.set('amethyst',{r:0.40,g:0.30,b:0.50});
gColorLibrary.set('fireball',{r:0.55,g:0.20,b:0.22});
//
let gNextColor = gColorLibrary.get(INITIAL_COLOR_NAME);

function chooseColor(colorName) {
    gNextColor = gColorLibrary.get(colorName);
}

//
// Controls which type of mirror gets used.
//
let gCurved = 0; // Spherical mirror (1); curved funhouse mirror (0).

function sphericalMirror(makeSpherical) {
    //
    // Controls whether the display uses a spherical, or curved
    // funhouse, mirror.
    //
    if (makeSpherical) {
        gCurved = 0;
    } else {
        gCurved = 1;
    }
}

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

   SOME CONFIGURATION GLOBALS

*/

//
// Width/height of the canvas in pixels.
//
const gHeight = 512;
const gWidth  = 1024;  // This MUST be double gHeight.
//
//
const gSceneBounds = {
    //
    left:   -1.0, 
    right:   1.0,
    //
    bottom:  0.0, 
    top:     2.0
};
//
const gSPHERE_SELECT_COLOR  = {r:0.950, g:0.900, b:0.500}; // Yellow.
const gCURVE_COLOR  = {r:0.325, g:0.575, b:0.675}; // Chalk blue.
const gPOINT_COLOR  = {r:0.825, g:0.475, b:0.175}; // Chalk orange.
const gFLOOR_COLOR0 = {r:0.125, g:0.175, b:0.25};
const gFLOOR_COLOR1 = {r:0.125, g:0.25, b:0.175};
//
const LIGHT_COLOR     = {r:0.9, g:0.88, b:0.84};
const LIGHT_POSITION  = new Point3d(0.0, 1.0, 0.0);
//    
const EYE_POSITION    = new Point3d(0.0, 1.0, -2.0);
const INTO_DIRECTION  = new Vector3d(0.0, 0.0, 1.0);
const RIGHT_DIRECTION = new Vector3d(1.0, 0.0, 0.0);
const UP_DIRECTION    = new Vector3d(0.0, 1.0, 0.0);
//
const gCPs = [new Point3d(-0.75, 0.2, 0.0),
              new Point3d(-0.5, 0.75, 0.0),
              new Point3d( 0.5, 1.25, 0.0)];
const gCurve = new Curve(gCPs);
const gSpheres = [new Sphere({r:0.9,g:0.9,b:0.9}, new Point3d(0.0,1.0,0.0))];
//
const EDITING_NOTHING         = 0;
const EDITING_CONTROL_POINT   = 1;
const EDITING_VIEW            = 2;
const EDITING_SPHERE          = 3;
const EDITING_SPHERE_POSITION = 4;
const EDITING_SPHERE_SIZE     = 5;
//
const EDITING_THRESHOLD = 1.1;
//
let gEditMode  = EDITING_NOTHING;
let gEditing   = null;
let gWhichCP   = -1;

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   
   SUPPORT FOR SPHERE AND CURVE PLACEMENT

   The code below is used for placing spheres in the scene.

   ---

   Placement editing by mouse events:
   
   * Mouse clicks either select a nearby object or place a new clone
   from the object library.  Subsequent dragging motion can be used to
   resize and reorient the object until the mouse is released, but
   this behavior only gets engaged if the drag extends a certain
   radius from the initial click.

   * A quick click (with no significant drag) instead puts the
   program in "object placement" mode, where the user can instead
   place the object somewhere else. A subsequent click drops
   the object in that spot.

*/

function removeSelectedSphere() {
    /*
     * Removes the current sphere placement from the scene.
     */
    
    //
    // Scan the placements, remove the one that's selected.
    for (let index = 1; index < gSpheres.length; index++) {
        if (gSpheres[index] == gEditing) {
            gSpheres.splice(index,1);
            // No placement is selected as a result.
            gEditing  = null;
            gEditMode = EDITING_NOTHING;
            return;
        }
    }
}

function selectOrCreateSphere(mouseXY) {
    /*
     * Chooses which placement the user wants to edit, given a
     * location of the mouse pointer.
     */
    
    let click = new Point3d(mouseXY.x, mouseXY.y, 0.0);

    //
    // See if we clicked on some sphere.
    let selected = null;
    for (let sphere of gSpheres) {
        if (sphere.includes(click)) {
            selected = sphere;
        }
    }

    //
    // If not, make a new sphere at that place.
    if (selected == null) {
        selected = new Sphere(gNextColor, click);
        gSpheres.push(selected);
    }

    //
    // Return selected or created sphere.
    return selected;

}

function handlePlaceSphere(mouseXY, down, drag) {
    /*
     * Handles a mouse click with the button pressed down or released,
     * and also a mouse drag with the button pressed or not, and
     * whenever the mouse movement should be interpreted for placing
     * spheres in the scene.
     *
     * When the mouse is first clicked, either a new sphere gets
     * placed in the scene, or else a nearby one is selected. This
     * puts the GUI in EDITING_SPHERE mode. If this is followed by a
     * dragging of the mouse, then this code checks to see whether the
     * movement extends beyond a certain radius. If so, it enters
     * EDITING_SPHERE_SIZE mode to resize it.  If not, and the mouse
     * button is released, it enters EDITING_SPHERE_POSITION mode so
     * it can be moved around. A later click in this mode places it
     * and de-selects it.
     *
     */
    
    const mouseLocation = new Point3d(mouseXY.x, mouseXY.y, 0.0);

    if (down && !drag) { 
        //
        // Just clicked the mouse button...
        //

        if (gEditMode == EDITING_SPHERE) {
            
            //
            // Relocate then deselect.
            gEditing.moveTo(mouseLocation,gSceneBounds);
            //
            gEditing  = null;
            gEditMode = EDITING_NOTHING;
            
            //
            glutPostRedisplay();
            
        } else if (gEditMode == EDITING_SPHERE_SIZE) {
            gEditing  = null;
            gEditMode = EDITING_NOTHING;
            
            //
            glutPostRedisplay();
            
        } else if (gEditMode == EDITING_SPHERE_POSITION) {
            //
            // Relocate then deselect.
            gEditing.moveTo(mouseLocation,gSceneBounds);
            //
            gEditing  = null;
            gEditMode = EDITING_NOTHING;
            
            //
            glutPostRedisplay();
            
        } else if (gEditMode == EDITING_NOTHING) {
            //
            // Create or select a sphere.
            gEditing = selectOrCreateSphere(mouseLocation);
            gEditMode = EDITING_SPHERE;
            //
            glutPostRedisplay();
        }
        
    } else if (!down && !drag) {
        //
        // Just released the mouse button...
        //
        
        if (gEditMode == EDITING_SPHERE) {
            //
            // Haven't started resizing, so put in relocate mode.
            gEditMode = EDITING_SPHERE_POSITION;
            
        } else {
            //
            // Done resizing, deselect.
            gEditing  = null;
            gEditMode = EDITING_NOTHING;
            //
            glutPostRedisplay();
            
        }
        
    } else if (down && drag) {
        // Dragging the mouse (with mouse button pressed)...
        //
        if (gEditMode == EDITING_SPHERE) {
            //
            // Check if we should start resizing.
            const position = gEditing.position;
            const distance = position.dist(mouseLocation);
            const radius   = gEditing.radius;
            if (distance > EDITING_THRESHOLD * radius) {
                gEditMode = EDITING_SPHERE_SIZE;
            }
        }

        //
        // Resize the selected clone.
        if (gEditMode == EDITING_SPHERE_SIZE) {
            const center     = gEditing.position
            const distance   = center.dist(mouseLocation);
            gEditing.resize(distance, gSceneBounds);
            //
            glutPostRedisplay();
        }
    } else if (!down && drag) {
        // Moving the mouse (with mouse button released)...
        //
        if (gEditMode == EDITING_SPHERE_POSITION) {
            //
            // Move the selected clone.
            gEditing.moveTo(mouseLocation, gSceneBounds);
            //
            glutPostRedisplay();
        }
    }
}

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   
   MOUSE HANDLERS

*/

function mouseToSceneCoords(mousex, mousey) {
    /*
     * Convert mouse screen coordinates to scene coordinates.
     */
    
    //
    // A hack to adjust for the corner of the canvas.  There is a
    // javascript way of handling this probably.
    //
    mousex -= 10;
    mousey -= 10;
    
    //
    // Use the inverse of the GL_PROJECTION matrix to map from screen
    // coordinates to our scene coordinates.
    //
    const pj = mat4.create();
    glGetFloatv(GL_PROJECTION_MATRIX,pj);
    const pj_inv = mat4.create();
    mat4.invert(pj_inv,pj);
    const vp = [0,0,0,0];
    glGetIntegerv(GL_VIEWPORT,vp);
    const mousecoords = vec4.fromValues(2.0*mousex/vp[2]-1.0,
                                        1.0-2.0*mousey/vp[3],
                                        0.0, 1.0);
    vec4.transformMat4(location,mousecoords,pj_inv);
    //
    return {x:location[0], y:location[1]};
}    

function handleMouseClick(button, state, x, y) {
    /*
     * Records the location of a mouse click in object world coordinates.
     */

    const mouseXY = mouseToSceneCoords(x,y);

    
    //
    // Start tracking mouse for drags.
    if (state == GLUT_DOWN && button == GLUT_LEFT_BUTTON) {
        //
        // Handle dragging of an object within the scene.
        handlePlaceSphere(mouseXY, true, false);
        
    } else if (state == GLUT_UP && gEditMode >= EDITING_SPHERE) {
        //
        // A quick click starts placement of an object.
        handlePlaceSphere(mouseXY, false, false);
    } else if (gEditMode == EDITING_NOTHING &&  state == GLUT_DOWN && button == GLUT_MIDDLE_BUTTON) {
        const click = new Point3d(mouseXY.x, mouseXY.y, 0.0);
        gWhichCP = gCurve.chooseControlPoint(click);
        if (gWhichCP >= 0) {
            gEditMode = EDITING_CONTROL_POINT;
            gCPs[gWhichCP] = click;
            gCurve.update();
        }
    } else if (gEditMode == EDITING_CONTROL_POINT && state == GLUT_UP && button == GLUT_MIDDLE_BUTTON) {
        gCPs[gWhichCP] = new Point3d(mouseXY.x, mouseXY.y, 0.0);
        gCurve.update();
        gEditMode = EDITING_NOTHING;
    }
}

function handleMouseDrag(x, y) {
    /*
     * Handle the mouse movement resulting from a drag.
     */
    const mouseXY = mouseToSceneCoords(x,y);
    if (gEditMode >= EDITING_SPHERE) {
        //
        // Moving a selected object's placement...
        handlePlaceSphere(mouseXY, true, true);
    } else if (gEditMode == EDITING_CONTROL_POINT) {
        gCPs[gWhichCP] = new Point3d(mouseXY.x, mouseXY.y, 0.0);
        gCurve.update();
    }
}

function handleMouseMove(x, y) {
    /*
     * Handle the mouse movement with the mouse button not pressed.
     */
    const mouseXY = mouseToSceneCoords(x,y);
    
    if (gEditMode >= EDITING_SPHERE) {
        //
        // Only handle if placing a selected object.
        handlePlaceSphere(mouseXY, false, true);
    }
}

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   
   SCENE TOP PREVIEW

   The functions below render the editable scene from above.

*/

function drawScene() {
    /*
     * Renders all the placed objects within the WebGL/opengl context.
     *
     * Uses Phong shading (set by GL_LIGHTING) illuminated by a single
     * light, GL_LIGHT0.
     *
     */

    //
    // Turn on lighting.
    glEnable(GL_LIGHTING);
    glEnable(GL_LIGHT0);
    const lp = [LIGHT_POSITION.x, LIGHT_POSITION.z, LIGHT_POSITION.y];
    glLightfv(GL_LIGHT0, GL_POSITION, lp);

    for (let r=0; r<5; r++) {
        for (let c=0; c<5; c++) {
            glPushMatrix();
            glTranslatef(-1.0 + r*0.4 + 0.2, c*0.4 + 0.2, 0.0);
            glScalef(0.2,0.2,0.2);
            if ((r+c)%2 == 0) {
                glColor3f(gFLOOR_COLOR0.r, gFLOOR_COLOR0.g, gFLOOR_COLOR0.b);
            } else {
                glColor3f(gFLOOR_COLOR1.r, gFLOOR_COLOR1.g, gFLOOR_COLOR1.b);
            }
            glBeginEnd("square");
            glPopMatrix();
        }
    }
    
    //
    // Draw each sphere, highlighting any selected one.
    for (let sphere of gSpheres) {
        if (sphere != gSpheres[0] || gCurved == 0) {
            selected = null;
            if (sphere == gEditing) {
                selected = gSPHERE_SELECT_COLOR;
            }
            sphere.draw(selected, true, true);
        }
    }

    glDisable(GL_LIGHT0);
    glDisable(GL_LIGHTING);

    if (gCurved == 1) {
        gCurve.draw();
    }
}

function draw() {
    /*
     * Issue GL calls to draw the scene.
     */

    //
    // Clear the rendering information.
    glClearColor(0.2,0.2,0.3);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    glEnable(GL_DEPTH_TEST);
    //
    // Set up the scene coordinates.
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    glViewport(0, 0, gWidth, gHeight);
    glOrtho(-1, 3, 0.0, 2.0, -10.0, 10.0);
    
    //
    // Clear the transformation stack.
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    //
    // Draw all the objects in the scene.
    glEnable(GL_SCISSOR_TEST);
    glScissor(0, 0, gWidth - gHeight, gHeight); // Limit the area where it's drawn.
    drawScene();
    glDisable(GL_SCISSOR_TEST);
    glEnable(GL_SCISSOR_TEST);
    glScissor(gHeight, 0, gHeight, gHeight); // Limit the area where it's drawn.
    renderTrace();
    glDisable(GL_SCISSOR_TEST);
    //
    glFlush();
}

function initTrace() {
    const vsId = "glsl/trace-vs.c";
    const fsId = "glsl/trace-fs.c";
    const vsSrc = document.getElementById(vsId).text;
    const fsSrc = document.getElementById(fsId).text;
    const prgm = loadShaderProgram(vsSrc, fsSrc);
    const cbuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cbuf);
    const corners = [-1.0,-1.0, 0.0, 1.0,
                      1.0, 1.0, 0.0, 1.0,
                     -1.0, 1.0, 0.0, 1.0,
                     -1.0,-1.0, 0.0, 1.0,
                      1.0,-1.0, 0.0, 1.0,
                      1.0, 1.0, 0.0, 1.0
                    ];
    
    const cornersArray = new Float32Array(corners);
    gl.bufferData(gl.ARRAY_BUFFER, cornersArray, gl.STATIC_DRAW);
    const cornersAttrib = gl.getAttribLocation(prgm,'corner');
    //
    const lightColorUniform     = gl.getUniformLocation(prgm,'lightColor');
    const lightPositionUniform  = gl.getUniformLocation(prgm,'lightPosition');
    //
    const eyePositionUniform    = gl.getUniformLocation(prgm,'eyePosition');
    const intoDirectionUniform  = gl.getUniformLocation(prgm,'intoDirection');
    const rightDirectionUniform = gl.getUniformLocation(prgm,'rightDirection');
    const upDirectionUniform    = gl.getUniformLocation(prgm,'upDirection');
    //
    const curvedMirrorUniform  = gl.getUniformLocation(prgm,'curvedMirror');
    const sphereDataUniform     = gl.getUniformLocation(prgm,'sphereData');
    const numSpheresUniform     = gl.getUniformLocation(prgm,'numSpheres');
    //
    const controlPointsUniform  = gl.getUniformLocation(prgm,'controlPoints');
    //
    gTraceShader = {
        program: prgm,
        cornersBuffer: cbuf,
        //
        corners: cornersAttrib,
        //
        lightColor: lightColorUniform,
        lightPosition: lightPositionUniform,
        //
        eyePosition: eyePositionUniform,
        intoDirection: intoDirectionUniform,
        rightDirection: rightDirectionUniform,
        upDirection: upDirectionUniform,
        //
        curvedMirror: curvedMirrorUniform,
        sphereData: sphereDataUniform,
        numSpheres: numSpheresUniform,
        //
        controlPoints: controlPointsUniform
    };
}

function renderTrace() {
    gl.useProgram(gTraceShader.program);
    //
    gl.bindBuffer(gl.ARRAY_BUFFER, gTraceShader.cornersBuffer);
    gl.vertexAttribPointer(gTraceShader.corners, 4, gl.FLOAT, false, 0, 0);
    //
    const lightColor = [LIGHT_COLOR.r,
                        LIGHT_COLOR.g,
                        LIGHT_COLOR.b];
    gl.uniform3fv(gTraceShader.lightColor, lightColor);
    const lightPosition = [LIGHT_POSITION.x,
                           LIGHT_POSITION.y,
                           LIGHT_POSITION.z, 1.0];
    gl.uniform4fv(gTraceShader.lightPosition, lightPosition);
    //
    const eyePosition = [EYE_POSITION.x,
                         EYE_POSITION.y,
                         EYE_POSITION.z, 1.0];
    gl.uniform4fv(gTraceShader.eyePosition, eyePosition);
    const intoDirection = [INTO_DIRECTION.dx,
                           INTO_DIRECTION.dy,
                           INTO_DIRECTION.dz, 0.0];
    gl.uniform4fv(gTraceShader.intoDirection, intoDirection);
    const rightDirection = [RIGHT_DIRECTION.dx,
                            RIGHT_DIRECTION.dy,
                            RIGHT_DIRECTION.dz, 0.0];
    gl.uniform4fv(gTraceShader.rightDirection, rightDirection);
    const upDirection = [UP_DIRECTION.dx,
                         UP_DIRECTION.dy,
                         UP_DIRECTION.dz, 0.0];
    gl.uniform4fv(gTraceShader.upDirection, upDirection);
    //
    gl.uniform1i(gTraceShader.curvedMirror, gCurved);
    //
    const spheres = [];
    let index = 0;
    for (let sphere of gSpheres) {
        spheres.push(sphere.position.x);
        spheres.push(sphere.radius);
        spheres.push(sphere.position.y);        
        spheres.push(sphere.radius);
        spheres.push(sphere.color.r);
        spheres.push(sphere.color.g);
        spheres.push(sphere.color.b);
        index++;
    }
    if (gSpheres.length > 0) {
        gl.uniform1fv(gTraceShader.sphereData, spheres);
    }
    gl.uniform1i(gTraceShader.numSpheres, gSpheres.length);
    //
    const controls = [gCPs[0].x,gCPs[0].y,gCPs[1].x,gCPs[1].y,gCPs[2].x,gCPs[2].y];
    gl.uniform1fv(gTraceShader.controlPoints, controls);
    //
    gl.enableVertexAttribArray(gTraceShader.corners);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(gTraceShader.corners);
}

function handleKey(key, x, y) {
    const delta = 0.05;
    /*
     * Handle a keypress.
     */
    // Move the light/
    if (key == "i"  && LIGHT_POSITION.y < 2.0 - delta) {
        LIGHT_POSITION.y += delta;
    }
    if (key == "k"   && LIGHT_POSITION.y > delta) {
        LIGHT_POSITION.y -= delta;
    }
    if (key == "j" && LIGHT_POSITION.x > -1.0 + delta) {
        LIGHT_POSITION.x -= delta;
    }
    if (key == "l"  && LIGHT_POSITION.x < 1.0 - delta) {
        LIGHT_POSITION.x += delta;
    }
    if (key == "a" && LIGHT_POSITION.z < 2.0 - delta) {
        LIGHT_POSITION.z += delta;
    }
    if (key == "z"  && LIGHT_POSITION.z > delta) {
        LIGHT_POSITION.z -= delta;
    }

    //
    // Delete the selected object.
    if (key == "x") {
        if (gEditMode >= EDITING_SPHERE) {
            // Delete selected object placement.
            removeSelectedSphere();
        }
    }

    glutPostRedisplay();
}

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   GUI OBJECT DEFINTIONS FOR OPENGL
*/

function makeSquare() {
    glBegin(GL_TRIANGLES, "square");
    //
    glVertex3f(-1.0,-1.0,0.0);
    glVertex3f( 1.0,-1.0,0.0);
    glVertex3f( 1.0, 1.0,0.0);
    //
    glVertex3f(-1.0,-1.0,0.0);
    glVertex3f( 1.0, 1.0,0.0);
    glVertex3f(-1.0, 1.0,0.0);
    //
    glEnd();
}    

function makeSphereWireframe() {
    const numSides = 24;
    const dangle = Math.PI / numSides;
    glBegin(GL_LINES, "sphere-wireframe");
    for (let i=1; i<numSides; i++) {
        const angle0_ = (i-1)*dangle;
        const angle1_ = i*dangle;
        const r0 = Math.cos(angle0_);
        const r1 = Math.cos(angle1_);
        for (let j = 1; j <= numSides*2; j++) {
            const angle_0 = (j-1)*dangle;
            const angle_1 = j*dangle;
            //
            glVertex3f(r0*Math.cos(angle_0),
                       r0*Math.sin(angle_0),
                       Math.sin(angle0_));
            glVertex3f(r0*Math.cos(angle_1),
                       r0*Math.sin(angle_1),
                       Math.sin(angle0_));
            glVertex3f(r1*Math.cos(angle_1),
                       r1*Math.sin(angle_1),
                       Math.sin(angle1_));
            glVertex3f(r1*Math.cos(angle_0),
                       r1*Math.sin(angle_0),
                       Math.sin(angle1_));
        }
    }
    glEnd();
}

function makeSphere() {
    const numSides = 24;
    const dangle = Math.PI / numSides;
    glBegin(GL_TRIANGLES, "sphere");
    for (let i=1; i<numSides; i++) {
        const angle0_ = (i-1)*dangle;
        const angle1_ = i*dangle;
        const r0 = Math.sin(angle0_);
        const r1 = Math.sin(angle1_);
        for (let j = 1; j <= numSides*2; j++) {
            const angle_0 = (j-1)*dangle;
            const angle_1 = j*dangle;
            //
            glVertex3f(r0*Math.cos(angle_0),
                       r0*Math.sin(angle_0),
                       Math.cos(angle0_));
            glVertex3f(r0*Math.cos(angle_1),
                       r0*Math.sin(angle_1),
                       Math.cos(angle0_));
            glVertex3f(r1*Math.cos(angle_1),
                       r1*Math.sin(angle_1),
                       Math.cos(angle1_));
            //
            glVertex3f(r0*Math.cos(angle_0),
                       r0*Math.sin(angle_0),
                       Math.cos(angle0_));
            glVertex3f(r1*Math.cos(angle_1),
                       r1*Math.sin(angle_1),
                       Math.cos(angle1_));
            glVertex3f(r1*Math.cos(angle_0),
                       r1*Math.sin(angle_0),
                       Math.cos(angle1_));
        }
    }
    glEnd();
}

function makePath() {
    const numSides = 8;
    const dangle = 2.0 * Math.PI / numSides;
    glBegin(GL_LINES, "path");
    let angle = 0.0;
    for (let i=0; i<numSides; i++) {
        //
        glVertex3f(Math.cos(angle), Math.sin(angle), 0.0);
        glVertex3f(Math.cos(angle), Math.sin(angle), 1.0);
        //
        glVertex3f(Math.cos(angle), Math.sin(angle), 0.0);
        glVertex3f(Math.cos(angle+dangle), Math.sin(angle+dangle), 0.0);
        //
        glVertex3f(Math.cos(angle), Math.sin(angle), 1.0);
        glVertex3f(Math.cos(angle+dangle), Math.sin(angle+dangle), 1.0);
        //
        angle += dangle;
    }
    glEnd();
}


/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
   THE MAIN PROGRAM 
*/
function editor() {
    /*
     * The main procedure, sets up OPENGL and loads the object library.
     */

    // set up GL/UT, its canvas, and other components.
    glutInitDisplayMode(GLUT_SINGLE | GLUT_RGB | GLUT_DEPTH);
    glutInitWindowPosition(0, 0);
    glutInitWindowSize(gWidth, gHeight);
    glutCreateWindow('the dream of the 80s is alive in Portland')
    
    // Drawn objects.
    makeSphere();
    makeSphereWireframe();
    makePath();
    makeSquare();

    // Rendered scene.
    initTrace();
    
    // Register interaction callbacks.
    glutKeyboardFunc(handleKey);
    glutDisplayFunc(draw);
    glutMouseFunc(handleMouseClick)
    glutMotionFunc(handleMouseDrag)
    glutPassiveMotionFunc(handleMouseMove)
    
    // Go!
    glutMainLoop();

    return 0;
}

glRun(() => { editor(); }, true);

