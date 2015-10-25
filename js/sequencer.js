var audioContext = null;
var midiAccess;
var midiDevice;
var bpm = 128;
var tempo;
var scheduler;
var lookahead = 25.0; //How frequently to call scheduling function (ms)
var scheduleAheadTime = 0.1;    //How far ahead to schedule audio (sec)
var startTime = 0;
var playPressed = false;
var isPlaying = false;
var beatCounter = 0;
var beatDivider = 24;
var timerWorker = null;     // The Web Worker used to fire timer messages
var cc = [0x08]; //cc value for Doepfer A-190-2 Midi Interface sync

//Actions to perform on load
window.addEventListener('load', function() {

    //Prevent swipe down to refresh in Android Chrome 
    var lastTouchY = 0;
    var touchstartHandler = function(e) {
    if (e.touches.length != 1) return;
    lastTouchY = e.touches[0].clientY;
    maybePreventPullToRefresh =
        preventPullToRefreshCheckbox.checked &&
        window.pageYOffset == 0;
    }

    var touchmoveHandler = function(e) {
        var touchY = e.touches[0].clientY;
        var touchYDelta = touchY - lastTouchY;
        lastTouchY = touchY;

        if (touchYDelta > 0) {
            e.preventDefault();
            return;
        }
    }

    document.addEventListener('touchstart', touchstartHandler, false);
    document.addEventListener('touchmove', touchmoveHandler, false);


    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContext();
    //skin the midi device select dropdown
    $('.selectpicker').selectpicker();
    //initialize BPM range selector list and set default BPM
    createBPMOptions(document.getElementById("bpm"));
    document.getElementById("bpm").value = 128;
    document.getElementById("bpm").onchange = changeBPM;
    $('#bpm').iPhonePicker({ width: '220px', imgRoot: 'images/' });
    //remove focus from Play button
    $('#play').focus(function() {
        this.blur();
    });

    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
});

// Request MIDI access
if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess({
        sysex: false
    }).then(onMIDISuccess, onMIDIFailure);
} else {
    alert("No MIDI support in your browser.");
}

//If request MIDI access succeeded, set the select box options.
function onMIDISuccess(midi) {
    midiAccess = midi;
    console.log('MIDI Access Object', midiAccess);
    selectMIDIOut = document.getElementById("midiOut");
    selectMIDIOut.onchange = changeMIDIOut;
    selectMIDIOut.options.length = 0;

    //calculate the MIDI clock (24ppq)
    tempo = 60 / bpm / 24;

    var outputs = midiAccess.outputs.values();
    var deviceFound = false;
    for (var output = outputs.next(); output && !output.done; output = outputs.next()) {

        selectMIDIOut.appendChild(new Option(output.value.name, output.value.id, false, false));

        if (!deviceFound) {
            //set the initial midi device object to the first device found
            midiDevice = output.value;
            deviceFound = true;
        } 
    }

    if (!deviceFound) {
        document.getElementById("midiOut").appendChild(new Option("No Device Available", 0, false, false));
    }

    console.log('Output ', output);
}

//If request MIDI access failed, log message
function onMIDIFailure(e) {
    document.getElementById("midiOut").appendChild(new Option("No Device Available", 0, false, false));
    console.log("No access to MIDI devices or your browser doesn't support WebMIDI API." + e);
}

//Event handler for when midi device picker was changed
function changeMIDIOut(e) {
    var id = e.target[e.target.selectedIndex].value;
    if ((typeof(midiAccess.outputs) == "function")) {
        midiDevice = midiAccess.outputs()[e.target.selectedIndex];
    } else {
        midiDevice = midiAccess.outputs.get(id);
    }
}

//Event handler for when BPM picker was changed
function changeBPM(e) {
    bpm = e.target[e.target.selectedIndex].value;
    tempo = 60 / bpm / 24;
}


//Start the MIDI sequencer clock: Send a Clock Start signal first, 
//then keep sending Clock signals in tempo
function play() {
    if ($('#play').hasClass("disabled")) {
        window.alert("A midi device must be selected in order to play the sequencer.");
        return;
    }
    $('#play').toggleClass("btn-danger btn-success");
    $('#play').focus(function() {
        this.blur();
    });

    if (isPlaying) {
        //toggle icon to arrow
        $('#play').html("<i class=\"fa fa-play\"></i>");
        $('#status').text("Stopped");
        isPlaying = false;
        stop();
    }
    else {
        playPressed = true;
        isPlaying = true;
        $('#status').text("Playing...");
        //toggle icon to square
        $('#play').html("<i class=\"fa fa-stop\"></i>");
        nextClockTime = 0;
        tempo = 60 / bpm / 24;
        startTime = audioContext.currentTime + 0.005;
        scheduleClock();
    }
}

//Stops the MIDI clock
function stop() {
    midiDevice.send([0xFC]);
    window.clearTimeout(timerID);
}

//Schedules when the next clock should fire
function scheduleClock() {
    var currentTime = audioContext.currentTime;
    currentTime -= startTime;

    while (nextClockTime < currentTime + scheduleAheadTime) {
         if (playPressed) {
               setTimeout(function() {
                //send midi clock start only the first beat! 
                //timeout needed to avoid quick first pulse
                playPressed = false;
                midiDevice.send([0xFA]);
                midiDevice.send([0xF8]);
                //Send C0 for Doepfer A-190-2 Midi Interface Learn
                midiDevice.send([0x90, 12, 0x40]);
                midiDevice.send([0x80, 12, 0x40]);
            }, currentTime + nextClockTime);
         }
        advanceClock();
    }
    timerID = window.setTimeout("scheduleClock()", lookahead);
}

//move the clock forward by tempo intervals (24ppq)
function advanceClock() {
    //send midi clock signal
    midiDevice.send([0xF8]);
    //send cc for Doepfer A-190-2 Midi Interface
    if (beatCounter % beatDivider == 0) {     
        midiDevice.send([0xB0, cc, 0x7F]);
        midiDevice.send([0xB0, cc, 0x00]); 
    }
    beatCounter++;

    //the next clock will be at the next tempo marker
    nextClockTime += tempo;
}


//Helper function to create the BPM list
function createBPMOptions(select) {
    for (var i = 60; i < 200; i++) {
        createOption(select,i);
    }
}

//helper function to create a select control option
function createOption(select, num) {
  var option = document.createElement('option');
  option.text = num;
  option.value = num;
  select.add(option);
}