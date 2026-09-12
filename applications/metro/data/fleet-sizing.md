# Fleet assumptions

The default profile uses 52 trains with one agent and one emulated Uno per train,
plus a control agent. This is a historical reference, not a current service count.

- [RATP, December 2015](https://www.iledefrance-mobilites.fr/medias/portail-idfm/1319b0b4-8b2b-4b65-9f0a-693b80cd4e96_09-12-15%2BComit%C3%A9%2Bde%2Bligne%2B13%2B-%2BSupport%2Bpartie%2B2%2BRATP.pdf): 52 peak trains and a minimum 95-second trunk interval.
- [RATP, April 2018](https://www.iledefrance-mobilites.fr/medias/portail-idfm/1493526f-369a-43d3-812e-b59c4d6b7982_180403%2B-%2BComit%C3%A9%2Bde%2Bligne%2B13%2BV3-1.pdf), page 4: 52 peak trains out of 66, with 190-second branch intervals.

The model distributes 25 trains on the Asnières route and 27 on Saint-Denis.
One-way times of 37/40 minutes and terminal times of 155/165 seconds are modeling
assumptions. The split and dispatch sequence are not a verified current timetable.
Passing frequency and simultaneous fleet size are different quantities.
