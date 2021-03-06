"use strict";
var __reflect = (this && this.__reflect) || function (p, c, t) {
    p.__class__ = c, t ? t.push(c) : t = [c], p.__types__ = p.__types__ ? t.concat(p.__types__) : t;
};
var __extends = this && this.__extends || function __extends(t, e) { 
 function r() { 
 this.constructor = t;
}
for (var i in e) e.hasOwnProperty(i) && (t[i] = e[i]);
r.prototype = e.prototype, t.prototype = new r();
};
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var egret3d;
(function (egret3d) {
    var trail;
    (function (trail) {
        function vec3Add(a, b) { return new egret3d.Vector3().add(a, b); }
        function vec3Substract(a, b) { return new egret3d.Vector3().subtract(a, b); }
        function vec3Mutiply(a, b) { return new egret3d.Vector3().multiplyScalar(b, a); }
        function vec3Cross(a, b) { return new egret3d.Vector3().cross(a, b); }
        /**
         * @internal
         */
        var TrailBatcher = (function () {
            function TrailBatcher() {
                // 假设存活 5 秒, 每秒 60 帧, 则最多在存活时间内生成 300 个片段
                this._maxFragmentCount = 5 * 60;
                this._points = []; // 每个片段
                this._lastFrameEmit = true;
                this._pausedTime = -1; // 暂停时候的时间戳
                this._verticles = []; // 定点, 每 3 个值对应一个定点
                this._uvs = []; // UV, 每 2 个值对应一个定点
                this._colors = []; // 颜色, 每 4 个值对应一个颜色
                this._indices = []; // 三角形对应的定点索引, 每 3 个值对应一个颜色
            }
            TrailBatcher.prototype.pause = function () {
                this._pausedTime = paper.clock.timestamp();
            };
            TrailBatcher.prototype.resume = function () {
                if (this._pausedTime < 0) {
                    console.warn("_pausedTime should not be less than 0 in TrailBatcher.resume()");
                }
                var freezeTime = paper.clock.timestamp() - this._pausedTime;
                for (var _i = 0, _a = this._points; _i < _a.length; _i++) {
                    var p = _a[_i];
                    p.timeCreated += freezeTime;
                }
            };
            TrailBatcher.prototype.clean = function () {
                this._lastPosition = (void 0);
                this._points.length = 0;
                this._pausedTime = -1;
                this._resetMeshData();
            };
            TrailBatcher.prototype.init = function (comp) {
                this._comp = comp;
                this._createMesh();
            };
            TrailBatcher.prototype.update = function (elapsedTime) {
                if (!this._comp) {
                    return;
                }
                var comp = this._comp;
                // 暂停情况下不更新
                if (comp.isPaused) {
                    return;
                }
                // 自动销毁
                if (!comp.isPlaying) {
                    if (comp.autoDestruct && this._points.length < 2) {
                        comp.gameObject.destroy();
                    }
                }
                var now = paper.clock.timestamp();
                // 更新片段数据
                this._updateSegments(now);
                // 重新构建组成 mesh 的相关数据
                this._rebuildMeshData(now);
                // 更新 mesh
                this._composeMesh();
            };
            /**
             * 更新片段数据
             * @param now 当前时间戳
             */
            TrailBatcher.prototype._updateSegments = function (now) {
                var comp = this._comp;
                var curPosition = comp.transform.position;
                // 如果移动了足够远, 就生成新的点并重新构建 mesh, 否则只是修正最后的点
                var theDistance = this._lastPosition ? curPosition.getDistance(this._lastPosition) : -1;
                var count = this._points.length;
                var isPlaying = comp.isPlaying;
                if (isPlaying) {
                    if (theDistance > comp.minVertexDistance || theDistance < 0) {
                        this._points.push({ position: curPosition, timeCreated: now, lineBreak: false });
                        this._lastPosition = curPosition;
                    }
                    else if (count > 0) {
                        var lastPoint = this._points[count - 1];
                        lastPoint.position = curPosition;
                        lastPoint.timeCreated = now;
                    }
                }
                if (!isPlaying && this._lastFrameEmit && count > 0) {
                    this._points[count - 1].lineBreak = true;
                    this._lastFrameEmit = false;
                }
                // 移除过期的片段
                this._removeDeadPoints(now, comp.time);
            };
            /**
             * 移除超过生命周期的片段
             * @param now 当前时间戳
             * @param lifeTime 片段可存活时间
             */
            TrailBatcher.prototype._removeDeadPoints = function (now, lifeTime) {
                var len = this._points.length;
                if (len === 0) {
                    return;
                }
                for (var i = 0; i < len; i++) {
                    if (now - this._points[i].timeCreated < lifeTime) {
                        if (i > 0) {
                            this._points = this._points.splice(0, i);
                        }
                        break;
                    }
                }
            };
            /**
             * 重新组成 mesh 的相关数据
             * @param now 当前时间戳
             */
            TrailBatcher.prototype._rebuildMeshData = function (now) {
                var uvLengthScale = 0.01;
                this._resetMeshData();
                var count = this._points.length;
                if (count < 2) {
                    return;
                }
                var camera = this._getCamera();
                // 如果没有可用的 camera
                if (!camera) {
                    return;
                }
                var curDistance = 0.00;
                var comp = this._comp;
                for (var i = 0; i < count; ++i) {
                    var p = this._points[i];
                    // 根据片段生存的时间获取对应的宽度和颜色采样
                    var time = (now - p.timeCreated) / comp.time;
                    var color = this._getColorSample(comp, time);
                    var width = this._getWidthSample(comp, time);
                    // 当前拖尾片段的向量
                    var lineDirection = i === 0
                        ? vec3Substract(p.position, this._points[i + 1].position)
                        : vec3Substract(this._points[i - 1].position, p.position);
                    // 当前摄像机到游戏对象的向量
                    var vectorToCamera = vec3Substract(camera.transform.position, p.position);
                    // 以上两者的叉乘即为拖尾移动方向的垂直向量
                    var perpendicular = vec3Cross(lineDirection, vectorToCamera).normalize();
                    // 上述向量正反方向各走半个宽度值即为两个新的顶点值
                    var vertex = void 0;
                    vertex = vec3Add(p.position, vec3Mutiply(perpendicular, width * 0.5));
                    this._verticles[i * 6 + 0] = vertex.x;
                    this._verticles[i * 6 + 1] = vertex.y;
                    this._verticles[i * 6 + 2] = vertex.z;
                    vertex = vec3Add(p.position, vec3Mutiply(perpendicular, -width * 0.5));
                    this._verticles[i * 6 + 3] = vertex.x;
                    this._verticles[i * 6 + 4] = vertex.y;
                    this._verticles[i * 6 + 5] = vertex.z;
                    // 同样的颜色值
                    this._colors[i * 8 + 0] = color.r;
                    this._colors[i * 8 + 1] = color.g;
                    this._colors[i * 8 + 2] = color.b;
                    this._colors[i * 8 + 3] = color.a;
                    this._colors[i * 8 + 4] = color.r;
                    this._colors[i * 8 + 5] = color.g;
                    this._colors[i * 8 + 6] = color.b;
                    this._colors[i * 8 + 7] = color.a;
                    // 两点的 uv 值
                    if (comp.textureMode === trail.TrailTextureMode.Stretch) {
                        this._uvs[i * 2 + 0] = curDistance * uvLengthScale;
                        this._uvs[i * 2 + 1] = 1;
                        this._uvs[i * 2 + 0] = curDistance * uvLengthScale;
                        this._uvs[i * 2 + 1] = 0;
                    }
                    else {
                        // TODO: 在每个片段上重复贴图
                        this._uvs[i * 2 + 0] = 0;
                        this._uvs[i * 2 + 1] = 1;
                        this._uvs[i * 2 + 0] = 0;
                        this._uvs[i * 2 + 1] = 0;
                    }
                    if (i > 0 && !this._points[count - 1].lineBreak) {
                        curDistance += p.position.getDistance(this._points[count - 1].position);
                        this._indices[(i - 1) * 6 + 0] = (i * 2) - 2;
                        this._indices[(i - 1) * 6 + 1] = (i * 2) - 1;
                        this._indices[(i - 1) * 6 + 2] = i * 2;
                        this._indices[(i - 1) * 6 + 3] = (i * 2) + 1;
                        this._indices[(i - 1) * 6 + 4] = i * 2;
                        this._indices[(i - 1) * 6 + 5] = (i * 2) - 1;
                    }
                }
            };
            /**
             * 根据时间在获得颜色值取样
             * @param comp 拖尾组件
             * @param time 时间比例值
             */
            TrailBatcher.prototype._getColorSample = function (comp, time) {
                var color = egret3d.Color.create();
                if (comp.colors.length > 0) {
                    var colorTime = time * (comp.colors.length - 1);
                    var min = Math.floor(colorTime);
                    var max = egret3d.math.clamp(Math.ceil(colorTime), 0, comp.colors.length - 1);
                    var lerp = egret3d.math.inverseLerp(min, max, colorTime);
                    color.lerp(lerp, comp.colors[min], comp.colors[max]);
                }
                else {
                    color.lerp(time, egret3d.Color.WHITE, egret3d.Color.ZERO);
                }
                return color;
            };
            /**
             * 根据时间在获得宽度值取样
             * @param comp 拖尾组件
             * @param time 时间比例值
             */
            TrailBatcher.prototype._getWidthSample = function (comp, time) {
                var width;
                if (comp.widths.length > 0) {
                    var widthTime = time * (comp.widths.length - 1);
                    var min = Math.floor(widthTime);
                    var max = egret3d.math.clamp(Math.ceil(widthTime), 0, comp.widths.length - 1);
                    var lerp = egret3d.math.inverseLerp(min, max, widthTime);
                    width = egret3d.math.lerp(comp.widths[min], comp.widths[max], lerp);
                }
                else {
                    width = 1;
                }
                return width;
            };
            /**
             * 获取渲染用的相机
             */
            TrailBatcher.prototype._getCamera = function () {
                return egret3d.Camera.main;
            };
            /**
             * 重置组成 mesh 的相关数据
             */
            TrailBatcher.prototype._resetMeshData = function () {
                this._verticles.length = 0;
                this._uvs.length = 0;
                this._colors.length = 0;
                this._indices.length = 0;
            };
            /**
             * 更新 mesh
             */
            TrailBatcher.prototype._composeMesh = function () {
                if (this._points.length > this._maxFragmentCount) {
                    this._createMesh();
                }
                this._mesh.setAttributes("POSITION" /* POSITION */, this._verticles);
                this._mesh.setAttributes("TEXCOORD_0" /* TEXCOORD_0 */, this._uvs);
                this._mesh.setAttributes("COLOR_0" /* COLOR_0 */, this._colors);
                this._mesh.setIndices(this._indices);
            };
            /**
             * 生成 mesh 对象
             */
            TrailBatcher.prototype._createMesh = function () {
                // TODO: 在极端的情况 (tile 模式贴图), 无法准确的预估生成的顶点数
                this._mesh = egret3d.Mesh.create(this._maxFragmentCount * 4, (this._maxFragmentCount - 1) * 6);
            };
            return TrailBatcher;
        }());
        trail.TrailBatcher = TrailBatcher;
        __reflect(TrailBatcher.prototype, "egret3d.trail.TrailBatcher");
    })(trail = egret3d.trail || (egret3d.trail = {}));
})(egret3d || (egret3d = {}));
var egret3d;
(function (egret3d) {
    var trail;
    (function (trail) {
        /**
         * 拖尾的朝向
         */
        var TrailAlignment;
        (function (TrailAlignment) {
            TrailAlignment[TrailAlignment["View"] = 0] = "View";
            TrailAlignment[TrailAlignment["Local"] = 1] = "Local";
        })(TrailAlignment = trail.TrailAlignment || (trail.TrailAlignment = {}));
        /**
         * 拖尾的材质模式
         */
        var TrailTextureMode;
        (function (TrailTextureMode) {
            TrailTextureMode[TrailTextureMode["Tiling"] = 0] = "Tiling";
            TrailTextureMode[TrailTextureMode["Stretch"] = 1] = "Stretch";
        })(TrailTextureMode = trail.TrailTextureMode || (trail.TrailTextureMode = {}));
        /**
         * 拖尾组件
         */
        var TrailComponent = (function (_super) {
            __extends(TrailComponent, _super);
            function TrailComponent() {
                var _this = _super !== null && _super.apply(this, arguments) || this;
                /**
                 * 拖尾的存活时间 (秒)
                 */
                _this.time = 1.0;
                /**
                 * 生成下一个拖尾片段的最小距离
                 */
                _this.minVertexDistance = 0.1;
                /**
                 * 拖尾的宽度 (值 / 变化曲线)
                 */
                _this.widths = [];
                /**
                 * 拖尾的颜色 (值 / 变化曲线)
                 */
                _this.colors = [];
                /**
                 * 生命期结束后是否自动销毁
                 */
                _this.autoDestruct = true;
                /**
                 * 拖尾的朝向是始终面对摄像机还是有自己的单独设置
                 * @see {TrailAlignment}
                 */
                _this.Alignment = TrailAlignment.View;
                /**
                 * 拖尾的材质模式
                 * @see {TrailTextureMode}
                 */
                _this.textureMode = TrailTextureMode.Tiling;
                /**
                 * @internal
                 */
                _this._isPlaying = false;
                /**
                 * @internal
                 */
                _this._isPaused = false;
                _this._timeScale = 1.0;
                _this._batcher = new trail.TrailBatcher();
                return _this;
            }
            TrailComponent.prototype._clean = function () {
                this._batcher.clean();
            };
            TrailComponent.prototype.initialize = function () {
                _super.prototype.initialize.call(this);
                this._clean();
            };
            TrailComponent.prototype.uninitialize = function () {
                _super.prototype.uninitialize.call(this);
                this._clean();
            };
            /**
             * @internal
             */
            TrailComponent.prototype.initBatcher = function () {
                this._batcher.init(this);
            };
            /**
             * @internal
             */
            TrailComponent.prototype.update = function (elapsedTime) {
                this._batcher.update(elapsedTime * this._timeScale);
            };
            /**
             * 从头开始播放
             */
            TrailComponent.prototype.play = function () {
                this._isPlaying = true;
                this._isPaused = false;
                this._batcher.clean();
            };
            /**
             * (从暂停中)恢复播放, 如果未暂停, 就从头开始播放
             */
            TrailComponent.prototype.resume = function () {
                if (this._isPaused) {
                    this._isPaused = false;
                    this._batcher.resume();
                }
                else {
                    if (this._isPlaying) {
                        return;
                    }
                    this.play();
                }
            };
            /**
             * 暂停
             */
            TrailComponent.prototype.pause = function () {
                if (!this._isPlaying) {
                    return;
                }
                this._isPaused = true;
            };
            /**
             * 停止播放
             */
            TrailComponent.prototype.stop = function () {
                this._isPlaying = false;
                this._isPaused = false;
            };
            Object.defineProperty(TrailComponent.prototype, "isPlaying", {
                /**
                 * 是否正在播放
                 */
                get: function () {
                    return this._isPlaying;
                },
                enumerable: true,
                configurable: true
            });
            Object.defineProperty(TrailComponent.prototype, "isPaused", {
                /**
                 * 是否播放已经暂停
                 */
                get: function () {
                    return this._isPaused;
                },
                enumerable: true,
                configurable: true
            });
            __decorate([
                paper.serializedField
            ], TrailComponent.prototype, "time", void 0);
            __decorate([
                paper.serializedField
            ], TrailComponent.prototype, "minVertexDistance", void 0);
            __decorate([
                paper.serializedField
            ], TrailComponent.prototype, "widths", void 0);
            __decorate([
                paper.serializedField
            ], TrailComponent.prototype, "colors", void 0);
            __decorate([
                paper.serializedField
            ], TrailComponent.prototype, "autoDestruct", void 0);
            __decorate([
                paper.serializedField
            ], TrailComponent.prototype, "material", void 0);
            __decorate([
                paper.serializedField
            ], TrailComponent.prototype, "Alignment", void 0);
            __decorate([
                paper.serializedField
            ], TrailComponent.prototype, "textureMode", void 0);
            return TrailComponent;
        }(paper.BaseComponent));
        trail.TrailComponent = TrailComponent;
        __reflect(TrailComponent.prototype, "egret3d.trail.TrailComponent");
    })(trail = egret3d.trail || (egret3d.trail = {}));
})(egret3d || (egret3d = {}));
var egret3d;
(function (egret3d) {
    var trail;
    (function (trail_1) {
        /**
         * 拖尾系统
         */
        var TrailSystem = (function (_super) {
            __extends(TrailSystem, _super);
            function TrailSystem() {
                return _super !== null && _super.apply(this, arguments) || this;
            }
            TrailSystem.prototype.getMatchers = function () {
                return [
                    paper.Matcher.create(egret3d.Transform, egret3d.MeshFilter, egret3d.MeshRenderer, trail_1.TrailComponent),
                ];
            };
            TrailSystem.prototype.onFrame = function (deltaTime) {
                for (var _i = 0, _a = this.groups[0].entities; _i < _a.length; _i++) {
                    var entity = _a[_i];
                    var trail_2 = entity.getComponent(trail_1.TrailComponent);
                    if (!trail_2) {
                        continue;
                    }
                    trail_2.update(deltaTime);
                }
            };
            return TrailSystem;
        }(paper.BaseSystem));
        trail_1.TrailSystem = TrailSystem;
        __reflect(TrailSystem.prototype, "egret3d.trail.TrailSystem");
    })(trail = egret3d.trail || (egret3d.trail = {}));
})(egret3d || (egret3d = {}));
