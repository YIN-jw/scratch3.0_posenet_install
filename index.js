require('babel-polyfill');
const Runtime = require('../../engine/runtime');//异步

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Clone = require('../../util/clone');
const Cast = require('../../util/cast');
const Video = require('../../io/video');
const formatMessage = require('format-message');

//import * as posenet from '@tensorflow-models/posenet';
//const tf = require('@tensorflow/tfjs');
const posenet = require('@tensorflow-models/posenet');
const tf = require('@tensorflow/tfjs-core');
//const tf = require('@tensorflow/tfjs-converter');
const canvas = require('canvas')

/**
 * Sensor attribute video sensor block should report.
 * @readonly
 * @enum {string}
 */
const SensingAttribute = {//                                                  SensingAttribute函数
    /** The amount of motion. */
    MOTION: 'motion',

    /** The direction of the motion. */
    DIRECTION: 'direction'
};

/**
 * Subject video sensor block should report for.
 * @readonly
 * @enum {string}
 */
const SensingSubject = {//                                                    SensingSubject函数
    /** The sensor traits of the whole stage. */
    STAGE: 'Stage',

    /** The senosr traits of the area overlapped by this sprite. */
    SPRITE: 'this sprite'
};

/**
 * States the video sensing activity can be set to.
 * @readonly
 * @enum {string}
 */
const VideoState = {//                                                        VideoState函数
    /** Video turned off. */
    OFF: 'off',

    /** Video turned on with default y axis mirroring. */
    ON: 'on',

    /** Video turned on without default y axis mirroring. */
    ON_FLIPPED: 'on-flipped'
};

const NUMBERS = {//                                                        对应NUMBERS函数
    ONE: '1',
    TWO: '2',
    THREE: '3',
    FOUR: '4',
	FIVE: '5'
};

const POSES = {//                                                           对应POSES函数
    NOSE: 'nose',
    LEFTEYE: 'leftEye',
    RIGHTEYE: 'rightEye',
    LEFTEAR: 'leftEar',
	RIGHTEAR: 'rightEar',
	LEFTSHOULDER: 'leftShoulder',
	RIGHTSHOULDER: 'rightShoulder',
	LEFTELBOW: 'leftElbow',
	RIGHTELBOW: 'rightElbow',
	LEFTWRIST: 'leftWrist',
	RIGHTWRIST: 'rightWrist',
	LEFTHIP: 'leftHip',
	RIGHTHIP: 'rightHip',
	LEFTKNEE: 'leftKnee',
	RIGHTKNEE: 'rightKnee',
	LEFTANKLE: 'leftAnkle',
	RIGHTANKLE: 'rightAnkle'
};

const POSITIONS = {//                                                          对应POSITIONS函数
    X: 'x',
    Y: 'y'
};
/**
 * Class for the motion-related blocks in Scratch 3.0
 * @param {Runtime} runtime - the runtime instantiating this block package.
 * @constructor
 */
class Scratch3Posenet {
    constructor(runtime) {
        //this.knn = null
        this.trainTypes = ['1', '2', '3', '4', '5', '6']

        this.posenetInit()//                                                          对应结尾的posenetInit()函数
		//this.detectPose(frame,this.posenet)//                                              调用检测姿态的函数
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;//                                                      实例化此块包的运行时      

        /**
         * The last millisecond epoch timestamp that the video stream was
         * analyzed.
         * @type {number}
         */
        this._lastUpdate = null;//                                                     初始化_lastUpdate，对应下面的循环检测视频流

        if (this.runtime.ioDevices) {
            // Clear target motion state values when the project starts.
            this.runtime.on(Runtime.PROJECT_RUN_START, this.reset.bind(this));

            // Kick off looping the analysis logic.
            // this._loop();

            // Configure the video device with values from a globally stored
            // location.
            this.setVideoTransparency({
                TRANSPARENCY: this.globalVideoTransparency
            });
            this.videoToggle({
                VIDEO_STATE: this.globalVideoState
            });
        }

        //setInterval(async () => {
            //if (this.globalVideoState === VideoState.ON) {
                //await this.gotResult()
                //console.log('knn result:', this.trainResult)
            //}
        //}, 800)
    }

    /**
     * After analyzing a frame the amount of milliseconds until another frame
     * is analyzed.
     * @type {number}
     */
    static get INTERVAL() {
        return 33;//                                                              两帧之间获取的相差的毫秒数 INTERVAL
    }

    /**
     * Dimensions the video stream is analyzed at after its rendered to the
     * sample canvas.
     * @type {Array.<number>}
     */
    static get DIMENSIONS() {
        return [480, 360];//                                                        视频需要的维度（加载视频需要）DIMENSIONS
    }

    /**
     * The key to load & store a target's motion-related state.
     * @type {string}
     */
    static get STATE_KEY() {
        return 'Scratch.videoSensing';//                                            加载或存储目标相关的键（加载视频需要）STATE_KEY
    }

    /**
     * The default motion-related state, to be used when a target has no existing motion state.
     * @type {MotionState}
     */
    static get DEFAULT_MOTION_STATE() {//                                           默认的状态，当目标没有现有的状态时使用 DEFAULT_MOTION_STATE
        return {
            motionFrameNumber: 0,
            motionAmount: 0,
            motionDirection: 0
        };
    }

    /**
     * The transparency setting of the video preview stored in a value
     * accessible by any object connected to the virtual machine.
     * @type {number}
     */
    get globalVideoTransparency() {//                                                 设置视频透明度
        const stage = this.runtime.getTargetForStage();
        if (stage) {
            return stage.videoTransparency;
        }
        return 50;
    }

    set globalVideoTransparency(transparency) {
        const stage = this.runtime.getTargetForStage();
        if (stage) {
            stage.videoTransparency = transparency;
        }
        return transparency;
    }

    /**
     * The video state of the video preview stored in a value accessible by any
     * object connected to the virtual machine.
     * @type {number}
     */
    get globalVideoState() {//                                                      设置摄像头的状态   
        const stage = this.runtime.getTargetForStage();
        if (stage) {
            return stage.videoState;
        }
        return VideoState.ON;
    }

    set globalVideoState(state) {
        const stage = this.runtime.getTargetForStage();
        if (stage) {
            stage.videoState = state;
        }
        return state;
    }

    /**
     * Reset the extension's data motion detection data. This will clear out
     * for example old frames, so the first analyzed frame will not be compared
     * against a frame from before reset was called.
     */
    reset() {//                                                                            重置扩展的数据运动检测数据（摄像头？？）
        const targets = this.runtime.targets;
        for (let i = 0; i < targets.length; i++) {
            const state = targets[i].getCustomState(Scratch3Posenet.STATE_KEY);
            if (state) {
                state.motionAmount = 0;
                state.motionDirection = 0;
            }
        }
    }

    /**
     * Occasionally step a loop to sample the video, stamp it to the preview
     * skin, and add a TypedArray copy of the canvas's pixel data.
     * @private
     */
    _loop() {//                                                                                 执行一个循环来采样视频，将画布像素数据添加到TypedArray
        setTimeout(this._loop.bind(this), Math.max(this.runtime.currentStepTime, Scratch3Posenet.INTERVAL));

        // Add frame to detector
        const time = Date.now();
        if (this._lastUpdate === null) {//                                                向检测器添加帧
            this._lastUpdate = time;
        }
        const offset = time - this._lastUpdate;
        if (offset > Scratch3Posenet .INTERVAL) {
            const frame = this.runtime.ioDevices.video.getFrame({
                format: Video.FORMAT_IMAGE_DATA,
                dimensions: Scratch3Posenet .DIMENSIONS
            });
            if (frame) {
                this._lastUpdate = time;
            }
        }
    }
    
	
	
    /**
     * Create data for a menu in scratch-blocks format, consisting of an array
     * of objects with text and value properties. The text is a translated
     * string, and the value is one-indexed.
     * @param {object[]} info - An array of info objects each having a name
     *   property.
     * @return {array} - An array of objects with text and value properties.
     * @private
     */
    _buildMenu(info) {//                                                          为菜单创建数据块格式
        return info.map((entry, index) => {
            const obj = {};
            obj.text = entry.name;
            obj.value = entry.value || String(index + 1);
            return obj;
        });
    }

    /**
     * @param {Target} target - collect motion state for this target.
     * @returns {MotionState} the mutable motion state associated with that
     *   target. This will be created if necessary.
     * @private
     */
    _getMotionState(target) {//                                                     为目标收集运动状态，返回与该目标关联的可变运动状态（？？？）
        let motionState = target.getCustomState(Scratch3Posenet.STATE_KEY);
        if (!motionState) {
            motionState = Clone.simple(Scratch3Posenet.DEFAULT_MOTION_STATE);
            target.setCustomState(Scratch3Posenet.STATE_KEY, motionState);
        }
        return motionState;
    }

    static get SensingAttribute() {//                                                 static get SensingAttribute
        return SensingAttribute;
    }

    /**
     * An array of choices of whether a reporter should return the frame's
     * motion amount or direction.
     * @type {object[]} an array of objects
     * @param {string} name - the translatable name to display in sensor
     *   attribute menu
     * @param {string} value - the serializable value of the attribute
     */
    get ATTRIBUTE_INFO() {//                                                            ATTRIBUTE_INFO函数
        return [
            {
                name: 'motion',
                value: SensingAttribute.MOTION
            },
            {
                name: 'direction',
                value: SensingAttribute.DIRECTION
            }
        ];
    }

    static get SensingSubject() {//                                                     static get SensingSubject
        return SensingSubject;
    }

    /**
     * An array of info about the subject choices.
     * @type {object[]} an array of objects
     * @param {string} name - the translatable name to display in the subject menu
     * @param {string} value - the serializable value of the subject
     */
    get SUBJECT_INFO() {//                                                            SUBJECT_INFO函数
        return [
            {
                name: 'stage',
                value: SensingSubject.STAGE
            },
            {
                name: 'sprite',
                value: SensingSubject.SPRITE
            }
        ];
    }

    /**
     * States the video sensing activity can be set to.
     * @readonly
     * @enum {string}
     */
    static get VideoState() {//                                                     static get VideoState  
        return VideoState;
    }

    /**
     * An array of info on video state options for the "turn video [STATE]" block.
     * @type {object[]} an array of objects
     * @param {string} name - the translatable name to display in the video state menu
     * @param {string} value - the serializable value stored in the block
     */
    get VIDEO_STATE_INFO() {//                                                    VIDEO_STATE_INFO函数
        return [
            {
                name: 'off',
                value: VideoState.OFF
            },
            {
                name: 'on',
                value: VideoState.ON
            },
            {
                name: 'on flipped',
                value: VideoState.ON_FLIPPED
            }
        ];
    }

    static get NUMBERS() {//                                                     static get NUMBERS  
        return NUMBERS;
    }
	
	get NUMBERS_INFO() {//                                                       NUMBERS_INFO函数
        return [
            {
                name: '1',
                value: NUMBERS.ONE
            },
            {
                name: '2',
                value: NUMBERS.TWO
            },
            {
                name: '3',
                value: NUMBERS.THREE
            },
			{
                name: '4',
                value: NUMBERS.FOUR
            },
			{
                name: '5',
                value: NUMBERS.FIVE
            }
        ];
    }

    static get POSES() {//                                                     static get POSES  
        return POSES;
    }
	
	get POSES_INFO() {//                                                       POSES_INFO函数
        return [
            {
                name: 'nose',
                value: POSES.NOSE
            },
            {
                name: 'leftEye',
                value: POSES.LEFTEYE
            },
            {
                name: 'rightEye',
                value: POSES.RIGHTEYE
            },
			{
                name: 'leftEar',
                value: POSES.LEFTEAR
            },
			{
                name: 'rightEar',
                value: POSES.RIGHTEAR
            },
			{
                name: 'leftShoulder',
                value: POSES.LEFTSHOULDER
            },
            {
                name: 'rightShoulder',
                value: POSES.RIGHTSHOULDER
            },
            {
                name: 'leftElbow',
                value: POSES.LEFTELBOW
            },
			{
                name: 'rightElbow',
                value: POSES.RIGHTELBOW
            },
			{
                name: 'leftWrist',
                value: POSES.LEFTWRIST
            },
			{
                name: 'rightWrist',
                value: POSES.RIGHTWRIST
            },
			{
                name: 'leftHip',
                value: POSES.LEFTHIP
            },
			{
                name: 'rightHip',
                value: POSES.RIGHTHIP
            },
			{
                name: 'leftKnee',
                value: POSES.LEFTKNEE
            },
			{
                name: 'rightKnee',
                value: POSES.RIGHTKNEE
            },
			{
                name: 'leftAnkle',
                value: POSES.LEFTANKLE
            },
			{
                name: 'rightAnkle',
                value: POSES.RIGHTANKLE
            }
        ];
    }

    static get POSITIONS() {//                                                     static get POSITIONS 
        return POSITIONS;
    }
	
	get POSITIONS_INFO() {//                                                       POSITIONS_INFO函数
        return [
            {
                name: 'x',
                value: POSITIONS.X
            },
            {
                name: 'y',
                value: POSITIONS.Y
            }
        ];
    }
    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo() {
        return {
            id: 'posenet',//                                                               整个插件的ID
            name: formatMessage({
                id: 'posenet.categoryName',
                default: 'Posenet',
                description: 'Label for the posenet extension category'
            }),
            blocks: [
                {
                    opcode: 'videoToggle',
                    text: 'turn video [VIDEO_STATE]',
                    arguments: {
                        VIDEO_STATE: {
                            type: ArgumentType.NUMBER,
                            menu: 'VIDEO_STATE',
                            defaultValue: VideoState.ON
                        }
                    }
                },
                {
                    opcode: 'setVideoTransparency',
                    text: 'set video transparency to [TRANSPARENCY]',
                    arguments: {
                        TRANSPARENCY: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 50
                        }
                    }
                },
                {
                    opcode: 'isloaded',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'posenet.isloaded',
                        default: 'is loaded',
                        description: 'posenet is loaded'
                    })
                },
                {
                    opcode: 'poseConfidence',//单个人的人体置信度
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'posenet.poseConfidence',
                        default: 'single pose confidence',//此处要定义一个目录NUMBERS
                        description: 'get single pose confidence'
                    }),
                },
				{
                    opcode: 'multiplePoseConfidence',//多个人的人体置信度
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'posenet.multiplePoseConfidence',
                        default: 'multiple pose [NUMBERS] confidence',//此处要定义一个目录NUMBERS
                        description: 'get multiple pose confidence'
                    }),
                    arguments: {
                        NUMBERS: {
                            type: ArgumentType.STRING,
							menu: 'NUMBERS',
                            defaultValue: NUMBERS.ONE//列表默认值为1,元素包含12345
                        }
                    }
                },
                {
                    opcode: 'posePartPosition',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'posenet.posePartPosition',
                        default: 'single pose part [POSES] position [POSITIONS]',//定义列表NUMBERS,POSES,POSITIONS
                        description: 'get pose position'
                    }),
                    arguments: {
						POSES: {
                            type: ArgumentType.STRING,
                            menu: 'POSES',
                            defaultValue: POSES.NOSE//POSES中包含身体的每个部位
                        },
						POSITIONS: {
                            type: ArgumentType.STRING,
                            menu: 'POSITIONS',
                            defaultValue: POSITIONS.X//POSITIONS中包含x,y
                        }
                    }
                },
				{
                    opcode: 'multiplePosePartPosition',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'posenet.multiplePosePartPosition',
                        default: 'multiple pose [NUMBERS] part [POSES] position [POSITIONS]',//定义列表NUMBERS,POSES,POSITIONS
                        description: 'get multiple pose position'
                    }),
                    arguments: {
                        NUMBERS: {
                            type: ArgumentType.STRING,
                            menu: 'NUMBERS',
                            defaultValue: NUMBERS.ONE//NUMBERS目录中包含元素12345
                        },
						POSES: {
                            type: ArgumentType.STRING,
                            menu: 'POSES',
                            defaultValue: POSES.NOSE//POSES中包含身体的每个部位
                        },
						POSITIONS: {
                            type: ArgumentType.STRING,
                            menu: 'POSITIONS',
                            defaultValue: POSITIONS.X//POSITIONS中包含x,y
                        }
                    }
                },
                {
                    opcode: 'posePartConfidence',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'posenet.posePartConfidence',
                        default: 'single pose part [POSES] confidence',//定义列表NUMBERS,POSES
                        description: 'get single pose part confidence'
                    }),
                    arguments: {
						POSES: {
                            type: ArgumentType.STRING,
                            menu: 'POSES',
                            defaultValue: POSES.NOSE//POSES中包含身体的每个部位
                        }
                    }
                },
				{
                    opcode: 'multiplePosePartConfidence',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'posenet.multiplePosePartConfidence',
                        default: 'multiple pose [NUMBERS] part [POSES] confidence',//定义列表NUMBERS,POSES
                        description: 'get multiple pose part confidence'
                    }),
                    arguments: {
                        NUMBERS: {
                            type: ArgumentType.STRING,
                            menu: 'NUMBERS',
                            defaultValue: NUMBERS.ONE//NUMBERS目录中包含元素12345
                        },
						POSES: {
                            type: ArgumentType.STRING,
                            menu: 'POSES',
                            defaultValue: POSES.NOSE//POSES中包含身体的每个部位
                        }
                    }
                },
				{
					opcode:'drawPoint',//画点
					blockType: BlockType.COMMAND,
					text: formatMessage({
                        id: 'posenet.drawPoint',
                        default: 'drawPoint',
                        description: 'draw the Point'
                    })
				},
				{
					opcode:'drawSkeleton',//画骨架
					blockType: BlockType.COMMAND,
					text: formatMessage({
                        id: 'posenet.drawSkeleton',
                        default: 'drawSkeleton',
                        description: 'draw the skeleton'
                    })
				},
				{
					opcode:'drawBoundingBox',//画骨架
					blockType: BlockType.COMMAND,
					text: formatMessage({
                        id: 'posenet.drawBoundingBox',
                        default: 'drawBoundingBox',
                        description: 'draw the bounding box'
                    })
				},
				{
					opcode:'stop',//停止定时器的运行
					blockType: BlockType.COMMAND,
					text: formatMessage({
                        id: 'posenet.stop',
                        default: 'stop',
                        description: 'stop'
                    })
				}
            ],
            menus: {
				NUMBERS: {
                    acceptReporters: true,
                    items: this._buildMenu(this.NUMBERS_INFO)
                },
				POSES: {
                    acceptReporters: true,
                    items: this._buildMenu(this.POSES_INFO)
                },
				POSITIONS: {
                    acceptReporters: true,
                    items: this._buildMenu(this.POSITIONS_INFO)
                },
				VIDEO_STATE: {
                    acceptReporters: true,
                    items: this._buildMenu(this.VIDEO_STATE_INFO)
                },
                ATTRIBUTE: {
					acceptReporters: true,
					items: this._buildMenu(this.ATTRIBUTE_INFO)
				},
                SUBJECT: {
					acceptReporters: true,
					items: this._buildMenu(this.SUBJECT_INFO)
				}
                //VIDEO_STATE: this._buildMenu(this.VIDEO_STATE_INFO)
            }
        };
    }


    /**
     * A scratch command block handle that configures the video state from
     * passed arguments.
     * @param {object} args - the block arguments
     * @param {VideoState} args.VIDEO_STATE - the video state to set the device to
     */
    videoToggle(args) {
        const state = args.VIDEO_STATE;
        this.globalVideoState = state;
        if (state === VideoState.OFF) {
            this.runtime.ioDevices.video.disableVideo();
        } else {
            this.runtime.ioDevices.video.enableVideo().then(() => {
				this.video = this.runtime.ioDevices.video.provider.video
				console.log('this.video got')
				console.log(this.video)
				//this.image = this.runtime.ioDevices.video.provider.image
				//console.log('this image got')
				this.originCanvas = this.runtime.renderer._gl.canvas  // 右上侧canvas
				this.canvas_one = document.createElement('canvas') // 创建用于绘制canvas_one
				this.canvas_two = document.createElement('canvas') // 创建用于绘制canvas_two
				this.canvas_three = document.createElement('canvas') // 创建用于绘制canvas_three
				console.log(this.canvas_one)
				console.log(this.canvas_two)
				console.log(this.canvas_three)
				//获得video数据
			})
            // Mirror if state is ON. Do not mirror if state is ON_FLIPPED.
            this.runtime.ioDevices.video.mirror = state === VideoState.ON;
        }
    }

    /**
     * A scratch command block handle that configures the video preview's
     * transparency from passed arguments.
     * @param {object} args - the block arguments
     * @param {number} args.TRANSPARENCY - the transparency to set the video
     *   preview to
     */
    setVideoTransparency(args) {
        const transparency = Cast.toNumber(args.TRANSPARENCY);
        this.globalVideoTransparency = transparency;
        this.runtime.ioDevices.video.setPreviewGhost(transparency);
    }

    isloaded() {
        return Boolean(this.posenet)
    }
	
	poseConfidence(args,util) {//                                        检测单个人的人体置信度
		if (this.globalVideoState === VideoState.OFF){
			alert('请先打开摄像头')
			return
		}
		return new Promise((resolve, reject) => {
		this.timer = setInterval(async () => {
			const imageScaleFactor = 0.50;
            const flipHorizontal = false;
            const outputStride = 16;
			this.video.width=500;
			this.video.height=500;
            const imageElement = this.video;
			//
			const net =this.posenet;
			const pose = await net.estimateSinglePose(imageElement, imageScaleFactor, flipHorizontal, outputStride);
			resolve(pose.score)
		    console.log(pose.score)//        resolve要对应promise使用
			console.log(pose)
		},1000);
		})
		//return pose.score                这里控制台显示pose没有定义
	}
	
    multiplePoseConfidence(args,util) {//                                 检测多个人的人体置信度
		if (this.globalVideoState === VideoState.OFF){
			alert('请先打开摄像头')
			return
		}
		return new Promise((resolve, reject) => {
		this.timer = setInterval(async () => {
			const imageScaleFactor = 0.50;
            const flipHorizontal = false;
            const outputStride = 16;
			const maxPoseDetections = 5;//     get up to 5 poses
			const scoreThreshold = 0.5;//    minimum confidence of the root part of a pose
			const nmsRadius = 20;//   minimum distance in pixels between the root parts of poses
			this.video.width=500;
			this.video.height=500;
            const imageElement = this.video;
			//
			const net =this.posenet;
			const poses = await net.estimateMultiplePoses(imageElement, imageScaleFactor, flipHorizontal, outputStride,maxPoseDetections,scoreThreshold,nmsRadius);
			let n = args.NUMBERS;
			if (n == NUMBERS.ONE){
				resolve(poses[0].score)
			}
			if (n == NUMBERS.TWO){
				resolve(poses[1].score)
			}
			if (n == NUMBERS.THREE){
				resolve(poses[2].score)
			}
			if (n == NUMBERS.FOUR){
				resolve(poses[3].score)
			}
			if (n == NUMBERS.FIVE){
				resolve(poses[4].score)
			}
		    console.log(poses)//        resolve要对应promise使用
		},1000);
		})
		//return pose.score                这里控制台显示pose没有定义
	}
	
	drawPoint(args,util){//画点
		if (this.globalVideoState === VideoState.OFF) {
			alert('请先打开摄像头')
			return
		}
		return new Promise((resolve, reject) => {
			//
			const originCanvas = this.originCanvas  // 右上侧canvas
			const canvas = this.canvas_one
			
			canvas.width = 480
			canvas.height = 360
			// 将绘制的canvas覆盖于原canvas之上
			originCanvas.parentElement.style.position = 'relative'
			canvas.style.position = 'absolute'
			canvas.style.top = '0'
			canvas.style.left = '0'
			console.log(canvas)
			originCanvas.parentElement.append(canvas)
			//console.log(canvas)
			// 循环检测并绘制检测结果
            this.timer = setInterval(async () => {
				const imageScaleFactor = 0.50;
				const flipHorizontal = false;
				const outputStride = 16;
				const maxPoseDetections = 5;//     get up to 5 poses
				const scoreThreshold = 0.5;//    minimum confidence of the root part of a pose
				const nmsRadius = 20;//   minimum distance in pixels between the root parts of poses
				this.video.width=500;
				this.video.height=500;
				const imageElement = this.video;
				const net = this.posenet;
				const poses = await net.estimateMultiplePoses(imageElement, imageScaleFactor, flipHorizontal, outputStride,maxPoseDetections,scoreThreshold,nmsRadius);
				//已经将pose提取出来，准备画姿态
				canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
				//
				for (j in poses) {
				    if (poses[j].score >= 0.2) {//poses会对这个人的置信度进行打分，当打分大于某个值时，就进行姿态的绘制
					    for (i in poses[j].keypoints) {
						    const points = poses[j].keypoints[i]//points为每个人的各个部位的信息
						    if (points.score >= 0.1) {//当这个人的这个部位置信度大于某个值，就在画布上表示出这个部位
							    const {y,x} = points.position
							    //开始进行画点
							    canvas.getContext('2d').beginPath()// canvas起始
							    canvas.getContext('2d').arc(x * 0.8, y * 0.6, 3, 0, 2 * Math.PI)//arc画圆，x，y为中心，r为半径，最后为起始角和终止角
							    canvas.getContext('2d').fillStyle = "#FF0000"
							    canvas.getContext('2d').fill()
						    }
					    }
				    }
				}
            }, 1000);
        })
		
	}
	
	drawSkeleton(args,util) {//画骨架
		if (this.globalVideoState === VideoState.OFF) {
			alert('请先打开摄像头')
			return
		}
		return new Promise((resolve, reject) => {
			//
			const originCanvas = this.originCanvas  // 右上侧canvas
			const canvas = this.canvas_two
			
			canvas.width = 500
			canvas.height = 500
			// 将绘制的canvas覆盖于原canvas之上
			originCanvas.parentElement.style.position = 'relative'
			canvas.style.position = 'absolute'
			canvas.style.top = '0'
			canvas.style.left = '0'
			console.log(canvas)
			originCanvas.parentElement.append(canvas)
			// 循环检测并绘制检测结果
            this.timer = setInterval(async () => {
				const imageScaleFactor = 0.50;
				const flipHorizontal = false;
				const outputStride = 16;
				const maxPoseDetections = 5;//     get up to 5 poses
				const scoreThreshold = 0.5;//    minimum confidence of the root part of a pose
				const nmsRadius = 20;//   minimum distance in pixels between the root parts of poses
				this.video.width=500;
				this.video.height=500;
				const imageElement = this.video;
				const net = this.posenet;
				const poses = await net.estimateMultiplePoses(imageElement, imageScaleFactor, flipHorizontal, outputStride,maxPoseDetections,scoreThreshold,nmsRadius);
				//已经将pose提取出来，准备画姿态
				canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
				//
				for (j in poses) {
				    if (poses[j].score >= 0.2) {//poses会对这个人的置信度进行打分，当打分大于某个值时，就进行姿态的绘制
					    const adjacentKeyPoints = posenet.getAdjacentKeyPoints(poses[j].keypoints, 0.2)//如果出来的两个点置信度小于这个值，那么两个点就不会被连起来
					    for (i in adjacentKeyPoints) {
						    const points = adjacentKeyPoints[i]//获得的点为一组点
						    canvas.getContext('2d').beginPath()// canvas起始
						    canvas.getContext('2d').moveTo(points[0].position.x * 0.8, points[0].position.y * 0.6)
						    canvas.getContext('2d').lineTo(points[1].position.x * 0.8, points[1].position.y * 0.6)
						    canvas.getContext('2d').lineWidth = 2
						    canvas.getContext('2d').strokeStyle = `aqua`
						    canvas.getContext('2d').stroke()
					    }
				    }
				}
            }, 1000);
        })
	}
	
	drawBoundingBox(args,util) {//画边框
		if (this.globalVideoState === VideoState.OFF) {
			alert('请先打开摄像头')
			return
		}
		return new Promise((resolve, reject) => {
			//
			const originCanvas = this.originCanvas  // 右上侧canvas
			const canvas = this.canvas_three  // 创建用于绘制canvas
			
			canvas.width = 500
			canvas.height = 500
			// 将绘制的canvas覆盖于原canvas之上
			originCanvas.parentElement.style.position = 'relative'
			canvas.style.position = 'absolute'
			canvas.style.top = '0'
			canvas.style.left = '0'
			console.log(canvas)
			originCanvas.parentElement.append(canvas)
			// 循环检测并绘制检测结果
            this.timer = setInterval(async () => {
				const imageScaleFactor = 0.50;
				const flipHorizontal = false;
				const outputStride = 16;
				const maxPoseDetections = 5;//     get up to 5 poses
				const scoreThreshold = 0.5;//    minimum confidence of the root part of a pose
				const nmsRadius = 20;//   minimum distance in pixels between the root parts of poses
				this.video.width=500;
				this.video.height=500;
				const imageElement = this.video;
				const net = this.posenet;
				const poses = await net.estimateMultiplePoses(imageElement, imageScaleFactor, flipHorizontal, outputStride,maxPoseDetections,scoreThreshold,nmsRadius);
				//已经将pose提取出来，准备画姿态
				canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
				//
				for (j in poses) {
				    if (poses[j].score >= 0.2) {//poses会对这个人的置信度进行打分，当打分大于某个值时，就进行姿态的绘制
					const boundingBox = posenet.getBoundingBox(poses[j].keypoints)
					//console.log(boundingBox)
					canvas.getContext('2d').beginPath()// canvas起始
					canvas.getContext('2d').rect(boundingBox.minX * 0.8, boundingBox.minY * 0.6, boundingBox.maxX * 0.8 - boundingBox.minX * 0.8,boundingBox.maxY * 0.6 - boundingBox.minY * 0.6);
					canvas.getContext('2d').strokeStyle = `aqua`
					canvas.getContext('2d').stroke()
				    }
				}
				//canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
            }, 1000);
			
			//可以在后面设计一个停止的函数，这样点击就会停止
        })
	}
	
	stop(){
		clearInterval(this.timer)
		this.canvas_one.getContext('2d').clearRect(0, 0, this.canvas_one.width, this.canvas_one.height)
		this.canvas_two.getContext('2d').clearRect(0, 0, this.canvas_two.width, this.canvas_two.height)
		this.canvas_three.getContext('2d').clearRect(0, 0, this.canvas_three.width, this.canvas_three.height)
	}
	
	posePartPosition(args,util) {//                                      检测单个人的各个部位的坐标
		if (this.globalVideoState === VideoState.OFF) {
            alert('请先打开摄像头')
            return
        }
		return new Promise((resolve, reject) => {
            this.timer = setInterval(async () => {
				const imageScaleFactor = 0.50;
				const flipHorizontal = false;
				const outputStride = 16;
				this.video.width=500;
				this.video.height=500;
				const imageElement = this.video;
				const net = this.posenet;
				const pose = await net.estimateSinglePose(imageElement, imageScaleFactor, flipHorizontal, outputStride);
				//网络加载完毕
				for (i in pose.keypoints) {
					let part_info = pose.keypoints[i]//part_info为每个位置的所有信息
					let position_info = pose.keypoints[i].position//position_info为每个部位的位置信息
					let y = args.POSES
					let z = args.POSITIONS
					if (y == POSES.NOSE) {
						if (z == POSITIONS.X && part_info.part == 'nose'){
						    resolve(position_info.x)}
						else if (z == POSITIONS.Y && part_info.part == 'nose'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.LEFTEYE) {
						if (z == POSITIONS.X && part_info.part == 'leftEye'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'leftEye'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.RIGHTEYE) {
						if (z == POSITIONS.X && part_info.part == 'rightEye'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'rightEye'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.LEFTEAR) {
						if (z == POSITIONS.X && part_info.part == 'leftEar'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'leftEar'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.RIGHTEAR) {
						if (z == POSITIONS.X && part_info.part == 'rightEar'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'rightEar'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.LEFTSHOULDER) {
						if (z == POSITIONS.X && part_info.part == 'leftShoulder'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'leftShoulder'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.RIGHTSHOULDER) {
						if (z == POSITIONS.X && part_info.part == 'rightShoulder'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'rightShoulder'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.LEFTELBOW) {
						if (z == POSITIONS.X && part_info.part == 'leftElbow'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'leftElbow'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.RIGHTELBOW) {
						if (z == POSITIONS.X && part_info.part == 'rightElbow'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'rightElbow'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.LEFTWRIST) {
						if (z == POSITIONS.X && part_info.part == 'leftWrist'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'leftWrist'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.RIGHTWRIST) {
						if (z == POSITIONS.X && part_info.part == 'rightWrist'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'rightWrist'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.LEFTHIP) {
						if (z == POSITIONS.X && part_info.part == 'leftHip'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'leftHip'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.RIGHTHIP) {
						if (z == POSITIONS.X && part_info.part == 'rightHip'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'rightHip'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.LEFTKNEE) {
						if (z == POSITIONS.X && part_info.part == 'leftKnee'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'leftKnee'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.RIGHTKNEE) {
						if (z == POSITIONS.X && part_info.part == 'rightKnee'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'rightKnee'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.LEFTANKLE) {
						if (z == POSITIONS.X && part_info.part == 'leftAnkle'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'leftAnkle'){
							resolve(position_info.y)
						}
					}
					if (y == POSES.RIGHTANKLE) {
						if (z == POSITIONS.X && part_info.part == 'rightAnkle'){
							resolve(position_info.x)
						}
						else if (z == POSITIONS.Y && part_info.part == 'rightAnkle'){
							resolve(position_info.y)
						}
					}
				}
                //console.log(pose)
            }, 1000);
        })
		
	}
	
	multiplePosePartPosition(args,util) {//                            检测多个人的人体部位的坐标
		if (this.globalVideoState === VideoState.OFF) {
            alert('请先打开摄像头')
            return
        }
		return new Promise((resolve, reject) => {
		this.timer = setInterval(async () => {
			const imageScaleFactor = 0.50;
            const flipHorizontal = false;
            const outputStride = 16;
			const maxPoseDetections = 5;//     get up to 5 poses
			const scoreThreshold = 0.5;//    minimum confidence of the root part of a pose
			const nmsRadius = 20;//   minimum distance in pixels between the root parts of poses
			this.video.width=500;
			this.video.height=500;
            const imageElement = this.video;
			//
			const net =this.posenet;
			const poses = await net.estimateMultiplePoses(imageElement, imageScaleFactor, flipHorizontal, outputStride,maxPoseDetections,scoreThreshold,nmsRadius);
			let n = args.NUMBERS;
			let i = args.POSES;
			let j = args.POSITIONS;
			if (n == NUMBERS.ONE){
				switch (i) {
					case POSES.NOSE:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[0].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[0].position.y);}
					break;
					case POSES.LEFTEYE:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[1].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[1].position.y);}
					break;
					case POSES.RIGHTEYE:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[2].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[2].position.y);}
					break;
					case POSES.LEFTEAR:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[3].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[3].position.y);}
					break;
					case POSES.RIGHTEAR:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[4].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[4].position.y);}
					break;
					case POSES.LEFTSHOULDER:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[5].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[5].position.y);}
					break;
					case POSES.RIGHTSHOULDER:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[6].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[6].position.y);}
					break;
					case POSES.LEFTELBOW:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[7].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[7].position.y);}
					break;
					case POSES.RIGHTELBOW:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[8].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[8].position.y);}
					break;
					case POSES.LEFTWRIST:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[9].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[9].position.y);}
					break;
					case POSES.RIGHTWRIST:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[10].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[10].position.y);}
					break;
					case POSES.LEFTHIP:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[11].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[11].position.y);}
					break;
					case POSES.RIGHTHIP:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[12].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[12].position.y);}
					break;
					case POSES.LEFTKNEE:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[13].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[13].position.y);}
					break;
					case POSES.RIGHTKNEE:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[14].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[14].position.y);}
					break;
					case POSES.LEFTANKLE:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[15].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[15].position.y);}
					break;
					case POSES.RIGHTANKLE:
					if (j == POSITIONS.X){resolve(poses[0].keypoints[16].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[0].keypoints[16].position.y);}
					break;
				}
			}
			if (n == NUMBERS.TWO){
				switch (i) {
					case POSES.NOSE:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[0].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[0].position.y);}
					break;
					case POSES.LEFTEYE:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[1].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[1].position.y);}
					break;
					case POSES.RIGHTEYE:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[2].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[2].position.y);}
					break;
					case POSES.LEFTEAR:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[3].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[3].position.y);}
					break;
					case POSES.RIGHTEAR:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[4].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[4].position.y);}
					break;
					case POSES.LEFTSHOULDER:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[5].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[5].position.y);}
					break;
					case POSES.RIGHTSHOULDER:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[6].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[6].position.y);}
					break;
					case POSES.LEFTELBOW:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[7].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[7].position.y);}
					break;
					case POSES.RIGHTELBOW:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[8].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[8].position.y);}
					break;
					case POSES.LEFTWRIST:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[9].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[9].position.y);}
					break;
					case POSES.RIGHTWRIST:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[10].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[10].position.y);}
					break;
					case POSES.LEFTHIP:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[11].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[11].position.y);}
					break;
					case POSES.RIGHTHIP:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[12].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[12].position.y);}
					break;
					case POSES.LEFTKNEE:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[13].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[13].position.y);}
					break;
					case POSES.RIGHTKNEE:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[14].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[14].position.y);}
					break;
					case POSES.LEFTANKLE:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[15].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[15].position.y);}
					break;
					case POSES.RIGHTANKLE:
					if (j == POSITIONS.X){resolve(poses[1].keypoints[16].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[1].keypoints[16].position.y);}
					break;
				}
			}
			if (n == NUMBERS.THREE){
					switch (i) {
					case POSES.NOSE:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[0].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[0].position.y);}
					break;
					case POSES.LEFTEYE:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[1].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[1].position.y);}
					break;
					case POSES.RIGHTEYE:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[2].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[2].position.y);}
					break;
					case POSES.LEFTEAR:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[3].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[3].position.y);}
					break;
					case POSES.RIGHTEAR:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[4].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[4].position.y);}
					break;
					case POSES.LEFTSHOULDER:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[5].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[5].position.y);}
					break;
					case POSES.RIGHTSHOULDER:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[6].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[6].position.y);}
					break;
					case POSES.LEFTELBOW:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[7].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[7].position.y);}
					break;
					case POSES.RIGHTELBOW:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[8].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[8].position.y);}
					break;
					case POSES.LEFTWRIST:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[9].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[9].position.y);}
					break;
					case POSES.RIGHTWRIST:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[10].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[10].position.y);}
					break;
					case POSES.LEFTHIP:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[11].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[11].position.y);}
					break;
					case POSES.RIGHTHIP:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[12].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[12].position.y);}
					break;
					case POSES.LEFTKNEE:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[13].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[13].position.y);}
					break;
					case POSES.RIGHTKNEE:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[14].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[14].position.y);}
					break;
					case POSES.LEFTANKLE:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[15].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[15].position.y);}
					break;
					case POSES.RIGHTANKLE:
					if (j == POSITIONS.X){resolve(poses[2].keypoints[16].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[2].keypoints[16].position.y);}
					break;
				}
			}
			if (n == NUMBERS.FOUR){
					switch (i) {
					case POSES.NOSE:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[0].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[0].position.y);}
					break;
					case POSES.LEFTEYE:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[1].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[1].position.y);}
					break;
					case POSES.RIGHTEYE:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[2].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[2].position.y);}
					break;
					case POSES.LEFTEAR:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[3].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[3].position.y);}
					break;
					case POSES.RIGHTEAR:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[4].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[4].position.y);}
					break;
					case POSES.LEFTSHOULDER:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[5].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[5].position.y);}
					break;
					case POSES.RIGHTSHOULDER:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[6].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[6].position.y);}
					break;
					case POSES.LEFTELBOW:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[7].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[7].position.y);}
					break;
					case POSES.RIGHTELBOW:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[8].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[8].position.y);}
					break;
					case POSES.LEFTWRIST:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[9].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[9].position.y);}
					break;
					case POSES.RIGHTWRIST:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[10].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[10].position.y);}
					break;
					case POSES.LEFTHIP:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[11].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[11].position.y);}
					break;
					case POSES.RIGHTHIP:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[12].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[12].position.y);}
					break;
					case POSES.LEFTKNEE:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[13].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[13].position.y);}
					break;
					case POSES.RIGHTKNEE:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[14].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[14].position.y);}
					break;
					case POSES.LEFTANKLE:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[15].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[15].position.y);}
					break;
					case POSES.RIGHTANKLE:
					if (j == POSITIONS.X){resolve(poses[3].keypoints[16].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[3].keypoints[16].position.y);}
					break;
				}
			}
			if (n == NUMBERS.FIVE){
					switch (i) {
					case POSES.NOSE:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[0].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[0].position.y);}
					break;
					case POSES.LEFTEYE:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[1].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[1].position.y);}
					break;
					case POSES.RIGHTEYE:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[2].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[2].position.y);}
					break;
					case POSES.LEFTEAR:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[3].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[3].position.y);}
					break;
					case POSES.RIGHTEAR:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[4].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[4].position.y);}
					break;
					case POSES.LEFTSHOULDER:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[5].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[5].position.y);}
					break;
					case POSES.RIGHTSHOULDER:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[6].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[6].position.y);}
					break;
					case POSES.LEFTELBOW:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[7].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[7].position.y);}
					break;
					case POSES.RIGHTELBOW:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[8].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[8].position.y);}
					break;
					case POSES.LEFTWRIST:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[9].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[9].position.y);}
					break;
					case POSES.RIGHTWRIST:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[10].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[10].position.y);}
					break;
					case POSES.LEFTHIP:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[11].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[11].position.y);}
					break;
					case POSES.RIGHTHIP:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[12].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[12].position.y);}
					break;
					case POSES.LEFTKNEE:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[13].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[13].position.y);}
					break;
					case POSES.RIGHTKNEE:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[14].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[14].position.y);}
					break;
					case POSES.LEFTANKLE:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[15].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[15].position.y);}
					break;
					case POSES.RIGHTANKLE:
					if (j == POSITIONS.X){resolve(poses[4].keypoints[16].position.x);}
					else if (j == POSITIONS.Y){resolve(poses[4].keypoints[16].position.y);}
					break;
				}
			}
		    console.log(poses)//        resolve要对应promise使用
		},1000);
		})
	}
	
	posePartConfidence(args,util) {//                              检测单个人的各个部位的置信度
		if (this.globalVideoState === VideoState.OFF) {
            alert('请先打开摄像头')
            return
        }
		return new Promise((resolve, reject) => {
            this.timer = setInterval(async () => {
				const imageScaleFactor = 0.50;
				const flipHorizontal = false;
				const outputStride = 16;
				this.video.width=500;
				this.video.height=500;
				const imageElement = this.video;
				const net = this.posenet;
				const pose = await net.estimateSinglePose(imageElement, imageScaleFactor, flipHorizontal, outputStride);
				//加载网络完毕，出现所有部位的信息
				let x = args.POSES;
				switch (x) {
					case POSES.NOSE:
					resolve(pose.keypoints[0].score);
					break;
					case POSES.LEFTEYE:
					resolve(pose.keypoints[1].score);
					break;
					case POSES.RIGHTEYE:
					resolve(pose.keypoints[2].score);
					break;
					case POSES.LEFTEAR:
					resolve(pose.keypoints[3].score);
					break;
					case POSES.RIGHTEAR:
					resolve(pose.keypoints[4].score);
					break;
					case POSES.LEFTSHOULDER:
					resolve(pose.keypoints[5].score);
					break;
					case POSES.RIGHTSHOULDER:
					resolve(pose.keypoints[6].score);
					break;
					case POSES.LEFTELBOW:
					resolve(pose.keypoints[7].score);
					break;
					case POSES.RIGHTELBOW:
					resolve(pose.keypoints[8].score);
					break;
					case POSES.LEFTWRIST:
					resolve(pose.keypoints[9].score);
					break;
					case POSES.RIGHTWRIST:
					resolve(pose.keypoints[10].score);
					break;
					case POSES.LEFTHIP:
					resolve(pose.keypoints[11].score);
					break;
					case POSES.RIGHTHIP:
					resolve(pose.keypoints[12].score);
					break;
					case POSES.LEFTKNEE:
					resolve(pose.keypoints[13].score);
					break;
					case POSES.RIGHTKNEE:
					resolve(pose.keypoints[14].score);
					break;
					case POSES.LEFTANKLE:
					resolve(pose.keypoints[15].score);
					break;
					case POSES.RIGHTANKLE:
					resolve(pose.keypoints[16].score);
					break;
				}
            }, 1000);
        })
	}
	
	multiplePosePartConfidence(args,util) {//                          检测多个人的人体部位的置信度
		if (this.globalVideoState === VideoState.OFF) {
            alert('请先打开摄像头')
            return
        }
		return new Promise((resolve, reject) => {
		this.timer = setInterval(async () => {
			const imageScaleFactor = 0.50;
            const flipHorizontal = false;
            const outputStride = 16;
			const maxPoseDetections = 5;//     get up to 5 poses
			const scoreThreshold = 0.5;//    minimum confidence of the root part of a pose
			const nmsRadius = 20;//   minimum distance in pixels between the root parts of poses
			this.video.width=500;
			this.video.height=500;
            const imageElement = this.video;
			//
			const net =this.posenet;
			const poses = await net.estimateMultiplePoses(imageElement, imageScaleFactor, flipHorizontal, outputStride,maxPoseDetections,scoreThreshold,nmsRadius);
			let n = args.NUMBERS;
			let i = args.POSES;
			if (n == NUMBERS.ONE){
				switch (i) {
					case POSES.NOSE:
					resolve(poses[0].keypoints[0].score);
					break;
					case POSES.LEFTEYE:
					resolve(poses[0].keypoints[1].score);
					break;
					case POSES.RIGHTEYE:
					resolve(poses[0].keypoints[2].score);
					break;
					case POSES.LEFTEAR:
					resolve(poses[0].keypoints[3].score);
					break;
					case POSES.RIGHTEAR:
					resolve(poses[0].keypoints[4].score);
					break;
					case POSES.LEFTSHOULDER:
					resolve(poses[0].keypoints[5].score);
					break;
					case POSES.RIGHTSHOULDER:
					resolve(poses[0].keypoints[6].score);
					break;
					case POSES.LEFTELBOW:
					resolve(poses[0].keypoints[7].score);
					break;
					case POSES.RIGHTELBOW:
					resolve(poses[0].keypoints[8].score);
					break;
					case POSES.LEFTWRIST:
					resolve(poses[0].keypoints[9].score);
					break;
					case POSES.RIGHTWRIST:
					resolve(poses[0].keypoints[10].score);
					break;
					case POSES.LEFTHIP:
					resolve(poses[0].keypoints[11].score);
					break;
					case POSES.RIGHTHIP:
					resolve(poses[0].keypoints[12].score);
					break;
					case POSES.LEFTKNEE:
					resolve(poses[0].keypoints[13].score);
					break;
					case POSES.RIGHTKNEE:
					resolve(poses[0].keypoints[14].score);
					break;
					case POSES.LEFTANKLE:
					resolve(poses[0].keypoints[15].score);
					break;
					case POSES.RIGHTANKLE:
					resolve(poses[0].keypoints[16].score);
					break;
				}
			}
			if (n == NUMBERS.TWO){
				switch (i) {
					case POSES.NOSE:
					resolve(poses[1].keypoints[0].score);
					break;
					case POSES.LEFTEYE:
					resolve(poses[1].keypoints[1].score);
					break;
					case POSES.RIGHTEYE:
					resolve(poses[1].keypoints[2].score);
					break;
					case POSES.LEFTEAR:
					resolve(poses[1].keypoints[3].score);
					break;
					case POSES.RIGHTEAR:
					resolve(poses[1].keypoints[4].score);
					break;
					case POSES.LEFTSHOULDER:
					resolve(poses[1].keypoints[5].score);
					break;
					case POSES.RIGHTSHOULDER:
					resolve(poses[1].keypoints[6].score);
					break;
					case POSES.LEFTELBOW:
					resolve(poses[1].keypoints[7].score);
					break;
					case POSES.RIGHTELBOW:
					resolve(poses[1].keypoints[8].score);
					break;
					case POSES.LEFTWRIST:
					resolve(poses[1].keypoints[9].score);
					break;
					case POSES.RIGHTWRIST:
					resolve(poses[1].keypoints[10].score);
					break;
					case POSES.LEFTHIP:
					resolve(poses[1].keypoints[11].score);
					break;
					case POSES.RIGHTHIP:
					resolve(poses[1].keypoints[12].score);
					break;
					case POSES.LEFTKNEE:
					resolve(poses[1].keypoints[13].score);
					break;
					case POSES.RIGHTKNEE:
					resolve(poses[1].keypoints[14].score);
					break;
					case POSES.LEFTANKLE:
					resolve(poses[1].keypoints[15].score);
					break;
					case POSES.RIGHTANKLE:
					resolve(poses[1].keypoints[16].score);
					break;
				}
			}
			if (n == NUMBERS.THREE){
				switch (i) {
					case POSES.NOSE:
					resolve(poses[2].keypoints[0].score);
					break;
					case POSES.LEFTEYE:
					resolve(poses[2].keypoints[1].score);
					break;
					case POSES.RIGHTEYE:
					resolve(poses[2].keypoints[2].score);
					break;
					case POSES.LEFTEAR:
					resolve(poses[2].keypoints[3].score);
					break;
					case POSES.RIGHTEAR:
					resolve(poses[2].keypoints[4].score);
					break;
					case POSES.LEFTSHOULDER:
					resolve(poses[2].keypoints[5].score);
					break;
					case POSES.RIGHTSHOULDER:
					resolve(poses[2].keypoints[6].score);
					break;
					case POSES.LEFTELBOW:
					resolve(poses[2].keypoints[7].score);
					break;
					case POSES.RIGHTELBOW:
					resolve(poses[2].keypoints[8].score);
					break;
					case POSES.LEFTWRIST:
					resolve(poses[2].keypoints[9].score);
					break;
					case POSES.RIGHTWRIST:
					resolve(poses[2].keypoints[10].score);
					break;
					case POSES.LEFTHIP:
					resolve(poses[2].keypoints[11].score);
					break;
					case POSES.RIGHTHIP:
					resolve(poses[2].keypoints[12].score);
					break;
					case POSES.LEFTKNEE:
					resolve(poses[2].keypoints[13].score);
					break;
					case POSES.RIGHTKNEE:
					resolve(poses[2].keypoints[14].score);
					break;
					case POSES.LEFTANKLE:
					resolve(poses[2].keypoints[15].score);
					break;
					case POSES.RIGHTANKLE:
					resolve(poses[2].keypoints[16].score);
					break;
				}
			}
			if (n == NUMBERS.FOUR){
				switch (i) {
					case POSES.NOSE:
					resolve(poses[3].keypoints[0].score);
					break;
					case POSES.LEFTEYE:
					resolve(poses[3].keypoints[1].score);
					break;
					case POSES.RIGHTEYE:
					resolve(poses[3].keypoints[2].score);
					break;
					case POSES.LEFTEAR:
					resolve(poses[3].keypoints[3].score);
					break;
					case POSES.RIGHTEAR:
					resolve(poses[3].keypoints[4].score);
					break;
					case POSES.LEFTSHOULDER:
					resolve(poses[3].keypoints[5].score);
					break;
					case POSES.RIGHTSHOULDER:
					resolve(poses[3].keypoints[6].score);
					break;
					case POSES.LEFTELBOW:
					resolve(poses[3].keypoints[7].score);
					break;
					case POSES.RIGHTELBOW:
					resolve(poses[3].keypoints[8].score);
					break;
					case POSES.LEFTWRIST:
					resolve(poses[3].keypoints[9].score);
					break;
					case POSES.RIGHTWRIST:
					resolve(poses[3].keypoints[10].score);
					break;
					case POSES.LEFTHIP:
					resolve(poses[3].keypoints[11].score);
					break;
					case POSES.RIGHTHIP:
					resolve(poses[3].keypoints[12].score);
					break;
					case POSES.LEFTKNEE:
					resolve(poses[3].keypoints[13].score);
					break;
					case POSES.RIGHTKNEE:
					resolve(poses[3].keypoints[14].score);
					break;
					case POSES.LEFTANKLE:
					resolve(poses[3].keypoints[15].score);
					break;
					case POSES.RIGHTANKLE:
					resolve(poses[3].keypoints[16].score);
					break;
				}
			}
			if (n == NUMBERS.FIVE){
				switch (i) {
					case POSES.NOSE:
					resolve(poses[4].keypoints[0].score);
					break;
					case POSES.LEFTEYE:
					resolve(poses[4].keypoints[1].score);
					break;
					case POSES.RIGHTEYE:
					resolve(poses[4].keypoints[2].score);
					break;
					case POSES.LEFTEAR:
					resolve(poses[4].keypoints[3].score);
					break;
					case POSES.RIGHTEAR:
					resolve(poses[4].keypoints[4].score);
					break;
					case POSES.LEFTSHOULDER:
					resolve(poses[4].keypoints[5].score);
					break;
					case POSES.RIGHTSHOULDER:
					resolve(poses[4].keypoints[6].score);
					break;
					case POSES.LEFTELBOW:
					resolve(poses[4].keypoints[7].score);
					break;
					case POSES.RIGHTELBOW:
					resolve(poses[4].keypoints[8].score);
					break;
					case POSES.LEFTWRIST:
					resolve(poses[4].keypoints[9].score);
					break;
					case POSES.RIGHTWRIST:
					resolve(poses[4].keypoints[10].score);
					break;
					case POSES.LEFTHIP:
					resolve(poses[4].keypoints[11].score);
					break;
					case POSES.RIGHTHIP:
					resolve(poses[4].keypoints[12].score);
					break;
					case POSES.LEFTKNEE:
					resolve(poses[4].keypoints[13].score);
					break;
					case POSES.RIGHTKNEE:
					resolve(poses[4].keypoints[14].score);
					break;
					case POSES.LEFTANKLE:
					resolve(poses[4].keypoints[15].score);
					break;
					case POSES.RIGHTANKLE:
					resolve(poses[4].keypoints[16].score);
					break;
				}
			}
		    //console.log(poses)//        resolve要对应promise使用
		},1000);
		})
		//return pose.score                这里控制台显示pose没有定义
	}
	

	
    async posenetInit () {//                                                                   使用await关键字，在函数的外面要对应使用async关键字，表示它是一个异步的函数
	    
        this.posenet = await posenet.load({//                                                    posenet模型存在参数的问题
			architecture: 'MobileNetV1',
            outputStride: 16,
            inputResolution: { width: 640, height: 480 },
            multiplier: 0.75
        }); //从检查点开始加载模型 
		console.log(this.posenet)
    }
	
}

module.exports = Scratch3Posenet;

