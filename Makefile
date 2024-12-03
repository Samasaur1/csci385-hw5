TSCFLAGS=-t esnext -m esnext

all: funhouse bezier-funhouse

bezier-funhouse: _bezier-funhouse.html trace-fs.glsl
	gsed -e '/@TRACE_FS@/{r trace-fs.glsl' -e 'd}' _bezier-funhouse.html > bezier-funhouse.html

funhouse: _funhouse.js
	head -n -1 _funhouse.js > funhouse.js

%.js: %.ts
	-tsc $(TSCFLAGS) $<

.PHONY: clean

clean:
	-rm _*.js
	-rm funhouse.js
	-rm bezier-funhouse.html
