const calculateRadarScore = require("./score");


const testToken = {
    creatorLaunches: 1,
    holderStatus: "PASS",
    returnPercent: 35
};


const score = calculateRadarScore(testToken);


console.log("RADAR SCORE:", score + "/100");