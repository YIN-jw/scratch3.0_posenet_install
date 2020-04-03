# scratch3.0_posenet_install
注：目前已经有很多优秀的开源了的扩展插件的过程，所以在这里主要想介绍对posenet模型的一些理解，同时程序还有很多需要改进的地方，欢迎大家提出建议：）
### 一、Scratch3.0网页版下载及安装
Scratch3.0的下载请参考官方，目前使用到的是scratch-gui和scratch-vm包。scratch-gui: https://github.com/LLK/scratch-gui.git ,scratch-vm:https://github.com/LLK/scratch-vm.git 。同时需要cmder输入指令，用到node和yarn安装依赖，请自行下载。在Scratch3.0中扩展插件的详细过程请参考：https://blog.just4fun.site/post/少儿编程/create-first-scratch3-extension/ 。
### 二、在Scratch3.0 GUI搭建插件
2.1、 首先在scratch-vm\src\extensions目录下新建scratch3_posenet文件夹。在scratch3_posenet文件夹中放置空白文件index.js。<br>
2.2、 设置extensions-manager.js文件，该文件夹位于scratch-vm\src\extensions-support文件夹下。修改方式如下：+所指部分为调价的代码：<br>
```const dispatch = require('../dispatch/central-dispatch');
const log = require('../util/log');
const maybeFormatMessage = require('../util/maybe-format-message');

const BlockType = require('./block-type');

const Scratch3KnnBlocks = require('../extensions/scratch3_knn');

const Scratch3FaceapiBlocks = require('../extensions/scratch3_faceapi');
+const Scratch3PosenetBlocks = require('../extensions/scratch3_posenet');
// These extensions are currently built into the VM repository but should not be loaded at startup.
// TODO: move these out into a separate repository?
// TODO: change extension spec so that library info, including extension ID, can be collected through static methods

const builtinExtensions = {
    // This is an example that isn't loaded with the other core blocks,
    // but serves as a reference for loading core blocks as extensions.
    coreExample: () => require('../blocks/scratch3_core_example'),
    // These are the non-core built-in extensions.
    pen: () => require('../extensions/scratch3_pen'),
    wedo2: () => require('../extensions/scratch3_wedo2'),
    music: () => require('../extensions/scratch3_music'),
    microbit: () => require('../extensions/scratch3_microbit'),
    text2speech: () => require('../extensions/scratch3_text2speech'),
    translate: () => require('../extensions/scratch3_translate'),
    videoSensing: () => require('../extensions/scratch3_video_sensing'),
    ev3: () => require('../extensions/scratch3_ev3'),
    makeymakey: () => require('../extensions/scratch3_makeymakey'),
    boost: () => require('../extensions/scratch3_boost'),
    gdxfor: () => require('../extensions/scratch3_gdx_for'),
    knnAlgorithm:() =>require('../extensions/scratch3_knn'),
    faceapi:()=>require('../extensions/scratch3_faceapi'),
   +posenet:()=>require('../extensions/scratch3_posenet')
};
......
```
2.3、 在scratch-gui\src\lib\libraries\extensions路径下新建文件夹posenet。在其中放入posenet.png和posenet-small.svg。<br>
2.4、 设置index.jsx 文件，该文件位于scratch-gui\src\lib\libraries\extensions路径下。修改方式如下，+所指部部分为添加的代码： 首先调用刚才放置好的.svg和.png图片作为模块的封面：
```
......
import makeymakeyIconURL from './makeymakey/makeymakey.png';
import makeymakeyInsetIconURL from './makeymakey/makeymakey-small.svg';

import knnalgorithmImage from './knnAlgorithm/knnAlgorithm.png';
import knnalgorithmInsetImage from './knnAlgorithm/knnAlgorithm-small.svg';

+import posenetImage from './posenet/posenet.png';
+import posenetInsetImage from './posenet/posenet-small.svg';

import microbitIconURL from './microbit/microbit.png';
import microbitInsetIconURL from './microbit/microbit-small.svg';
import microbitConnectionIconURL from './microbit/microbit-illustration.svg';
import microbitConnectionSmallIconURL from './microbit/microbit-small.svg';
......
```
之后设置posenet extension的封面：
```
export default [
......
},
+{
+       name: (
+           <FormattedMessage
+               defaultMessage="posenet"
+               description="Name for the 'posenet' extension"
+               id="gui.extension.posenet.name"
+           />
+       ),
+       extensionId: 'posenet',
+       iconURL: posenetImage,
+       insetIconURL: posenetInsetImage,
+       description: (
+           <FormattedMessage
+               defaultMessage="pose detection."
+               description="Description for the 'posenet' extension"
+               id="gui.extension.posenet.description"
+           />
+       ),
+       featured: true
+   },
......
```
注意extensionId部分的内容和步骤2中第一个代码框中冒号前内容相同，这是posenet extension的id 属性，因此必须相同，之后index.js的编写中也会有相应部分的提示。
2.5、进行测试。此时在/scratch-gui/ 中运行webpack-dev-server –https，之后新建console dialog 在/scratch-vm/ 中运行yarn run watch，再新建console dialog 在/scratch-gui/ 中运行yarn link scratch-vm。后所得的网页，在https://127.0.0.1:8601/ 端口可以看到posenet的封面已经完成，但此时点击不会有内容，我们此时需要对index.js的内容进行编辑。
### 三、模型加载
3.1、认识tfjs<br>
tfjs-core:基础包，包含一些最基本的用于机器学习的命令，如做一些线性运算和求梯度的运算；tfjs-converter：GraphModel导入和执行，执行一些简单的模型的导入和运行，可将从python中训练好的模型载入浏览器中；tfjs-layers：LayersModel创建&导入&执行，用于在网络中创建网络模型，对于没有打包好的模型，将训练好的模型的权重加进去打包成一个模型；tfjs-data：数据流工具包，对数据流进行控制。<br>
3.2、 环境配置<br>
Tensorflow.js:tfjs-core >= 1.2.6;tfjs-converter >= 1.2.5;tfjs-layers >= 1.2.5。Node.js >= v10.16.0(npm >= 6.9.0)。<br>
3.3、 导入Tensorflow.js模型<br>
在index.js开头加入：
```
require('babel-polyfill');
const Runtime = require('../../engine/runtime');

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
```
安装依赖：在这个插件中只需要两个包，在console的报错提示下，在对应路径中yarn add xxx即可（npm install xxx），就可以将模型安装到项目中去。该插件中安装了@tensorflow/tfjs-converter和@tensorflow-models/posenet  按照提示直到console不再报错。
### 四、index框架代码
注：index的框架应该按照官方的格式书写：https://github.com/LLK/scratch-vm/blob/develop/docs/extensions.md 。<br>
4.1、 复制knn extension对应的index.js文件的代码。 从* Sensor attribute video sensor block should report.* @readonly* @enum {string} 这一部分开始，直到代码结束。knn模块的代码请参考https://github.com/CodeLabClub/scratch3_knn 。并将复制得到代码中的全部Scratch3Knn改为Scratch3Posenet。<br>
4.2、 移动代码至getInfo()处修改extensionId为‘posenet‘，此处应和extension-manager.js和index.jsx中的id相同，否则无法在点击时自动显示extension对应的块。此外，name 为该extension在列表中的名字，仅标识用，安装需要修改即可。<br>
4.3、 删除getInfo()中block[ ]中除 videoToggle和setVideoTransparency之外的其他模块，并将这些模块的opcode所对应的function一并删除（位置在class posenet{ }中,getInfo(){ }的block[ ]之下）。<br>
4.4、 在getInfo(){ }中加入如下代码：
```
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
+               {
+                   opcode: 'isloaded',
+                   blockType: BlockType.REPORTER,
+                   text: formatMessage({
+                       id: 'posenet.isloaded',
+                       default: 'isloaded',
+                       description: 'posenet is loaded'
+                   })
+               }
            ],
```
此时再次运行所得网页，点击faceapi对应封面，则有对应菜单弹出且摄像头自动打开。至此，block的架构完成，可以开始添加执行代码。
### 五、 posenet模型加载
同时模型加载的方法参考Tensorflow.js官方：https://github.com/tensorflow/tfjs-models/tree/master/posenet 。<br>
5.1、 posenet模型存在四个参数：模型的名称、CNN中的一个参数、输入时图像的分辨率、设定其乘数。<br>
在index的后面定义一个异步的函数posenetInit()用于加载模型，这样加载模型就不会影响主进程的进行，在前面调用该函数即可。
```
    async posenetInit () {
        this.posenet = await posenet.load({
			architecture: 'MobileNetV1',
            outputStride: 16,
            inputResolution: { width: 640, height: 480 },
            multiplier: 0.75
        }); //从检查点开始加载模型 
		console.log(this.posenet)
    }
}
```
5.2、 在setVideoTransparency(args) { } 函数后添加isloaded()函数：
```
    isloaded() {
        return Boolean(this.posenet)
    }
```
5.3、 在cmder中运行webpack-dev-server --https，打开:https://127.0.0.1:8601/ 。点击isloaded积木块显示true，则代表模型成功加载。
### 六、posenet功能执行代码
注：模型功能的引用也参考官方的说明。个人的理解是模型输出为一个数组，其中包含人体的置信度、人体各个部位的名称及位置以及人体各个部位的置信度。<br>人体的置信度是pose.score，人体各个部位的信息pose.keypoints，人体各个部位的置信度pose.keypoints[i].score，人体各个部位的名称pose.keypoints[i].part。
6.1、 首先将VideoToggle(args){ }部分做如下修改：
```
    videoToggle(args) {
        const state = args.VIDEO_STATE;
        this.globalVideoState = state;
        if (state === VideoState.OFF) {
            this.runtime.ioDevices.video.disableVideo();
        } else {
            this.runtime.ioDevices.video.enableVideo().then(() => {
				+this.video = this.runtime.ioDevices.video.provider.video
				+console.log('this.video got')
				+console.log(this.video)
				//this.image = this.runtime.ioDevices.video.provider.image
				//console.log('this image got')
				+this.originCanvas = this.runtime.renderer._gl.canvas  // 右上侧canvas
				+this.canvas_one = document.createElement('canvas') // 创建用于绘制canvas_one
				+this.canvas_two = document.createElement('canvas') // 创建用于绘制canvas_two
				+this.canvas_three = document.createElement('canvas') // 创建用于绘制canvas_three
				+console.log(this.canvas_one)
				+console.log(this.canvas_two)
				+console.log(this.canvas_three)
				//获得video数据
			})
            // Mirror if state is ON. Do not mirror if state is ON_FLIPPED.
            this.runtime.ioDevices.video.mirror = state === VideoState.ON;
        }
    }
```
即在this.runtime.ioDevices.video.enableVideo()添加then(() => { // 获得video数据 this.video = this.runtime.ioDevices.video.provider.video console.log('this.video got') }); 部分，获得video数据。方便下一步的调用和处理。<br>
6.2、 人体置信度<br>在isloaded()函数后添加poseConfidence()：
```
	poseConfidence(args,util) {
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
		    console.log(pose.score)
			console.log(pose)
		},1000);
		})
	}
```
需要注意的是：刚开始在调用模型时，没有定义this.video的宽度和高度，出来的结果中没有每个姿态的具体位置，在这里要确保像源元素添加了宽度和高度，这样才能在控制台中出来各个姿态的具体位置。可以参考：https://github.com/CodeLabClub/scratch3_knn/issues/8 。<br>
此时调用该积木块即可得到单人的人体置信度，多人的人体置信度与单人的类似，只是需要在index前面定义一个NUMBERS{}用来表明需要检测的人体数量。
```
const NUMBERS = {
    ONE: '1',
    TWO: '2',
    THREE: '3',
    FOUR: '4',
	FIVE: '5'
};
```
再在class Scratch3Posenet {}中引入：
```
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
```
getInfo()部分的代码如下：
```
				{
                    opcode: 'multiplePoseConfidence',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'posenet.multiplePoseConfidence',
                        default: 'multiple pose [NUMBERS] confidence',
                        description: 'get multiple pose confidence'
                    }),
                    arguments: {
                        NUMBERS: {
                            type: ArgumentType.STRING,
							menu: 'NUMBERS',
                            defaultValue: NUMBERS.ONE
                        }
                    }
                },
```
对应的功能代码如下：
```
    multiplePoseConfidence(args,util) {
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
		    console.log(poses)
		},1000);
		})
	}
```
此时调用积木块即可得到多人的人体置信度，上面的代码最多只能进行五个人的识别，可以根据需要进行添加。<br>
6.3、 人体各部位置信度<br>
```
	posePartConfidence(args,util) {
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
```
调用该积木块可以获得单个人人体各部位的置信度，多个人的代码较长，就不浪费资源了，思路同多人置信度类似。<br>
6.4、 人体各部位位置<br>
得到人体各部位位置的程序和人体各部位置信度的思路类似，使用pose.keypoints[i].position可以获得，再使用switch以及if语句实现选择。  <br>
6.5、 绘制骨架<br>
绘制骨架中就需要用到在videoToggle(args){}函数中得到的canvas。代码如下：
```
	drawPoint(args,util){
		if (this.globalVideoState === VideoState.OFF) {
			alert('请先打开摄像头')
			return
		}
		return new Promise((resolve, reject) => {
			//
			const originCanvas = this.originCanvas 
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
				canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
				for (j in poses) {
				    if (poses[j].score >= 0.2) {//poses会对这个人的置信度进行打分，当打分大于某个值时，就进行姿态的绘制
					    for (i in poses[j].keypoints) {
						    const points = poses[j].keypoints[i]
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
```
可以绘制出人体的五官，同理可以使用posenet中的adjacentKeyPoints获得一组相关的点，使用canvas画线，可以将人体线条绘制出来；也可以使用getBoundingBox将人体边框绘制出来。
### 七、 画外音
至此我对于posenet模型的理解告一段落，可以看到程序很冗长，使用了大量的if和switch语句，之后会进行进一步的改进。在绘制人体骨架时，会存在绘制出的点偏离正确位置的情况，可以通过改动绘制时点的位置进行调整。<br>
大家若有兴趣，除了posenet模型，还有knn（图片分类）代码：https://github.com/CodeLabClub/scratch3_knn 开发过程：https://github.com/doNotBeTooSerious/scratch_knn_install 以及faceapi(人脸识别)模型可以参考https://github.com/doNotBeTooSerious/scratch_faceapi_install。<br>
