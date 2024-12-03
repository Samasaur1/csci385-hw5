TSCFLAGS=-t esnext -m esnext

all: funhouse

funhouse: _funhouse.js
	head -n -1 _funhouse.js > funhouse.js

%.js: %.ts
	-tsc $(TSCFLAGS) $<

.PHONY: clean

clean:
	-rm _*.js
	-rm funhouse.js
