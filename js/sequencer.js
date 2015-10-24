var audioContext = null;
var midiAccess;
var midiDevice;
var bpm = 128;
var tempo;
var scheduler;

var lookahead = 25.0;       // How frequently to call scheduling function 
                            //(in milliseconds)
var scheduleAheadTime = 0.1;    // How far ahead to schedule audio (sec)
                            // This is calculated from lookahead, and overlaps 
                            // with next interval (in case the timer is late)
var nextClockTime = 0.0;     // when the next note is due.
var startTime = 0;
var playPressed = false;
var isPlaying = false;

var beatCounter = 0;

//Midi note mappings
var notes = {
'C0':'12','C#0':'13','D0':'14','D#0':'15',
'E0':'16','F0':'17','F#0':'18','G0':'19',
'G#0':'20','A0':'21','A#0':'22','B0':'23',

'C1':'24','C#1':'25','D1':'26','D#1':'27',
'E1':'28','F1':'29','F#1':'30','G1':'31',
'G#1':'32','A1':'33','A#1':'34','B1':'35',

'C2':'36','C#2':'37','D2':'38','D#2':'39',
'E2':'40','F2':'41','F#2':'42','G2':'43',
'G#2':'44','A2':'45','A#2':'46','B2':'47',

'C3':'48','C#3':'49','D3':'50','D#3':'51',
'E3':'52','F3':'53','F#3':'54','G3':'55',
'G#3':'56','A3':'57','A#3':'58','B3':'59',

'C4':'60','C#4':'61','D4':'62','D#4':'63',
'E4':'64','F4':'65','F#4': '66','G4': '67',
'G#4':'68','A4':'69','A#4':'70','B4':'71',

'C5':'72','C#5':'73','D5':'74','D#5':'75',
'E5':'76','F5':'77','F#5':'78','G5':'79',
'G#5':'80','A5':'81','A#5':'82','B5':'83',

'C6':'84','C#6':'85','D6':'86','D#6':'87',
'E6':'88','F6':'89','F#6':'90','G6':'91',
'G#6':'92','A6':'93','A#6':'94','B6':'95',

'C7':'96','C#7':'97','D7':'98','D#7':'99',
'E7':'100','F7':'101','F#7':'102','G7':'103',
'G#7':'104','A7':'105','A#7':'106','B7':'107',

'C8':'108','C#8':'109','D8':'110','D#8':'111',
'E8':'112','F8':'113','F#8':'114','G8':'115',
'G#8':'116','A8':'117','A#8':'118','B8':'119',

'C9':'120','C#9':'121','D9':'122','D#9':'123',
'E9':'124','F9':'125','F#9':'126','G9':'127'
};

var note1 = notes['C4'];

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
            }, currentTime + nextClockTime);
         }
        advanceClock();
    }
    timerID = window.setTimeout("scheduleClock()", 0);
}

function advanceClock() {
    //send midi clock signal
    midiDevice.send([0xF8]);
    //advance beat
    beatCounter++;
    if (beatCounter == 192) {
        beatCounter = 0;
    }
    //eighth notes
    if (beatCounter % 12 == 0) {
        if (note1) {
            //turn off note
            midiDevice.send([0x80, note1, 0x40]);
            //console.log('Stopped note ' + note1);
        }
        //turn on note
        midiDevice.send([0x90, note1, 0x7f]);
        //console.log('Sent note ' + note1);
    }
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