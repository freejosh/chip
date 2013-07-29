/*jshint node: true */
// See http://www.seasip.demon.co.uk/ccfile.html

var fs = require('fs');

function reader(buffer, offset) {
	return {

		long: function() {
			var data = buffer.readUInt32LE(offset);
			offset += 4;
			return data;
		},

		word: function() {
			var data = buffer.readUInt16LE(offset);
			offset += 2;
			return data;
		},

		byte: function() {
			var data = buffer.readUInt8(offset);
			offset += 1;
			return data;
		},

		string: function(length) {
			var string = buffer.toString('ascii', offset, offset + length);
			offset += length;
			return string;
		},

		skip: function(n) {
			offset += n;
		},

		getOffset: function() {
			return offset;
		},

		getBuffer: function() {
			return buffer;
		}
	};
}

function readMap(read, bytes) {
	var map = [];
	var obj;
	var copies;
	var code;

	for (var i = 0; i < bytes; i++) {
		obj = read.byte();

		if (obj === 0xFF) {// run-length-encoding. takes the form: 0xFF, num-copies (byte), object-code (byte)
			copies = read.byte();
			code = read.byte();
			i += 2;

			while (copies-- >= 0) {
				map.push(code);
			}

		} else {
			map.push(obj);
		}
	}

	return map;
}

function readOptionalField(read, level) {
	var type = read.byte();
	var length = read.byte();
	var i;

	switch(type) {

	case 1:// is the level time (not used)
		level.time = read.word();
		break;

	case 2:// is the number of chips on the level (not used)
		level.chips = read.word();
		break;

	case 3:// is the map title.
		level.title = read.string(length - 1);
		read.skip(1);// terminating null
		break;

	case 4:// is used to map brown buttons to traps.
		if (level.trapControls === undefined) {
			level.trapControls = [];
		}

		length /= 10;// 5 fields of 2 bytes = num iterations

		for (i = 0; i < length; i++) {
			level.trapControls.push({
				buttonX: read.word(),
				buttonY: read.word(),
				trapX: read.word(),
				trapY: read.word()
			});
			read.word();// always 0
		}
		break;

	case 5:// is used to map red buttons to cloning machines.
		if (level.cloningControls === undefined) {
			level.cloningControls = [];
		}

		length /= 8;// 4 fields of 2 bytes = num iterations

		for (i = 0; i < length; i++) {
			level.cloningControls.push({
				buttonX: read.word(),
				buttonY: read.word(),
				trapX: read.word(),
				trapY: read.word()
			});
		}
		break;

	case 6:// is used to indicate password.
		// password is encrypted so get the buffer first
		level.password = read.getBuffer().slice(read.getOffset(), read.getOffset() + length - 1);

		// decrypt password by XORing each character with 0x99
		for (i = 0; i < level.password.length; i++) {
			level.password[i] ^= 0x99;
		}

		level.password = level.password.toString('ascii');
		read.skip(1);// terminating null
		break;

	case 7:// is used to indicate hint text
		level.hint = read.string(length - 1);
		read.skip(1);// terminating null
		break;

	case 8:// is also used to indicate the password (not encrypted) (not used)
		level.password = read.string(length - 1);
		read.skip(1);// terminating null
		break;

	case 10:// is used to indicate where moving objects (monsters) occur
		if (level.movingMonsters === undefined) {
			level.movingMonsters = [];
		}

		length /= 2;// 2 fields of 1 byte = num iterations

		for (i = 0; i < length; i++) {
			level.movingMonsters.push({
				x: read.byte(),
				y: read.byte()
			});
		}
		break;

	case 9:// is not used.
		/* falls through */
	default: //treated like Field 9.
		break;

	}
}

(function(inFile, outFile) {

	fs.readFile(inFile, function(err, buf) {
		if (err) throw err;

		var read = reader(buf, 0);

		// This is a 'magic number'. CHIPS.EXE uses this to check for a valid CHIPS.DAT file. The value must be 0x0002AAAC
		var magic = read.long();
		if (magic !== 0x0002AAAC) {
			console.error("Not a valid Chip's Challenge data file!");
			return;
		}

		var numLevels = read.word();
		console.info('Levels: %d', numLevels);

		var nextLevelOffset;
		var levels = [];
		var level;

		for (var i = 0; i < numLevels; i++) {

			level = {};
			levels.push(level);

			// Next word is number of bytes to end of level
			nextLevelOffset = read.word() + read.getOffset();

			level.number = read.word();
			level.time = read.word();
			level.chips = read.word();

			read.word();// The first word must always be 0 or 1, though 0 is not used in the existing CHIPS.DAT. Possibly it was intended to indicate whether the level data are uncompressed or compressed.

			level.map1 = readMap(read, read.word());
			level.map2 = readMap(read, read.word());

			// Next word is number of bytes to end of level
			if (read.word() + read.getOffset() !== nextLevelOffset) {
				console.warn('Offset mismatch in level %d data. Skipping to next level.', level.number);
				read.skip(nextLevelOffset - read.getOffset());
				continue;
			}

			// read optional fields
			while(read.getOffset() < nextLevelOffset) {
				readOptionalField(read, level);
			}
		}

		fs.writeFile(outFile, JSON.stringify(levels), function(err) {
			if (err) throw err;
			console.log('Done!');
		});
	});
})(process.argv[2], process.argv[3]);